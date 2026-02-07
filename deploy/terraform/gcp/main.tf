# =============================================================================
# Godel GCP Infrastructure
# Production-ready GKE cluster with Cloud SQL and Memorystore
# =============================================================================

terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
  }
  
  backend "gcs" {
    bucket = "godel-terraform-state"
    prefix = "gcp/terraform.tfstate"
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

provider "google-beta" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# =============================================================================
# VPC and Networking
# =============================================================================

resource "google_compute_network" "vpc" {
  name                    = "godel-${var.environment}"
  auto_create_subnetworks = false
  routing_mode            = "GLOBAL"
}

resource "google_compute_subnetwork" "subnet" {
  name          = "godel-${var.environment}"
  ip_cidr_range = var.subnet_cidr
  network       = google_compute_network.vpc.id
  region        = var.gcp_region
  
  private_ip_google_access = true
  
  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = var.pods_cidr
  }
  
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = var.services_cidr
  }
  
  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

resource "google_compute_router" "router" {
  name    = "godel-${var.environment}"
  network = google_compute_network.vpc.id
  region  = var.gcp_region
}

resource "google_compute_router_nat" "nat" {
  name                               = "godel-${var.environment}"
  router                             = google_compute_router.router.name
  region                             = var.gcp_region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
  
  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# =============================================================================
# GKE Cluster
# =============================================================================

resource "google_container_cluster" "primary" {
  name     = "godel-${var.environment}"
  location = var.gcp_region
  
  network    = google_compute_network.vpc.id
  subnetwork = google_compute_subnetwork.subnet.id
  
  # Enable Autopilot for simplified management
  enable_autopilot = var.enable_autopilot
  
  # Release channel
  release_channel {
    channel = "REGULAR"
  }
  
  # Network policy
  network_policy {
    enabled = true
  }
  
  # Private cluster config
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = var.master_cidr
  }
  
  # Master authorized networks
  master_authorized_networks_config {
    cidr_blocks {
      cidr_block   = "0.0.0.0/0"
      display_name = "All"
    }
  }
  
  # IP allocation policy for VPC-native cluster
  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }
  
  # Workload Identity
  workload_identity_config {
    workload_pool = "${var.gcp_project_id}.svc.id.goog"
  }
  
  # Cluster Autoscaling (for standard mode)
  dynamic "cluster_autoscaling" {
    for_each = var.enable_autopilot ? [] : [1]
    content {
      enabled = true
      
      resource_limits {
        resource_type = "cpu"
        minimum       = 2
        maximum       = 100
      }
      
      resource_limits {
        resource_type = "memory"
        minimum       = 4
        maximum       = 400
      }
    }
  }
  
  # Maintenance policy
  maintenance_policy {
    recurring_window {
      start_time = "2024-01-01T06:00:00Z"
      end_time   = "2024-01-01T12:00:00Z"
      recurrence = "FREQ=WEEKLY;BYDAY=SA,SU"
    }
  }
  
  # Logging and monitoring
  logging_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
  }
  
  monitoring_config {
    enable_components = ["SYSTEM_COMPONENTS"]
    managed_prometheus {
      enabled = true
    }
  }
  
  # Binary Authorization
  binary_authorization {
    evaluation_mode = "PROJECT_SINGLETON_POLICY_ENFORCE"
  }
  
  deletion_protection = var.environment == "production"
}

# Node pools for standard mode
resource "google_container_node_pool" "general" {
  count = var.enable_autopilot ? 0 : 1
  
  name       = "general"
  cluster    = google_container_cluster.primary.id
  location   = var.gcp_region
  node_count = var.node_count
  
  autoscaling {
    min_node_count = var.min_nodes
    max_node_count = var.max_nodes
  }
  
  management {
    auto_repair  = true
    auto_upgrade = true
  }
  
  node_config {
    machine_type = var.machine_type
    
    disk_size_gb = 100
    disk_type    = "pd-ssd"
    
    workload_metadata_config {
      mode = "GKE_METADATA"
    }
    
    service_account = google_service_account.gke.email
    
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]
    
    labels = {
      workload = "general"
    }
    
    tags = ["godel", var.environment]
  }
}

resource "google_service_account" "gke" {
  account_id   = "godel-gke-${var.environment}"
  display_name = "GKE Node Service Account"
}

# =============================================================================
# Cloud SQL PostgreSQL
# =============================================================================

resource "google_sql_database_instance" "postgres" {
  name             = "godel-${var.environment}"
  database_version = "POSTGRES_15"
  region           = var.gcp_region
  
  settings {
    tier = var.db_tier
    
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    
    disk_size         = 100
    disk_autoresize   = true
    disk_type         = "PD_SSD"
    
    backup_configuration {
      enabled    = true
      start_time = "03:00"
      
      backup_retention_settings {
        retained_backups = var.environment == "production" ? 30 : 7
        retention_unit   = "COUNT"
      }
    }
    
    maintenance_window {
      day          = 7  # Sunday
      hour         = 4
      update_track = "stable"
    }
    
    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = true
    }
    
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }
  }
  
  deletion_protection = var.environment == "production"
}

resource "google_sql_database" "godel" {
  name     = "godel"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "godel" {
  name     = "godel_admin"
  instance = google_sql_database_instance.postgres.name
  password = random_password.db_password.result
}

resource "random_password" "db_password" {
  length  = 32
  special = true
}

# =============================================================================
# Memorystore Redis
# =============================================================================

resource "google_redis_instance" "redis" {
  name               = "godel-${var.environment}"
  tier               = var.environment == "production" ? "STANDARD_HA" : "BASIC"
  memory_size_gb     = var.redis_memory_gb
  region             = var.gcp_region
  authorized_network = google_compute_network.vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"
  
  redis_version     = "REDIS_7_0"
  display_name      = "Godel Redis"
  
  maintenance_policy {
    weekly_maintenance_window {
      day = "TUESDAY"
      start_time {
        hours   = 3
        minutes = 0
      }
    }
  }
  
  persistence_config {
    persistence_mode    = "RDB"
    rdb_snapshot_period = "ONE_HOUR"
  }
}

# =============================================================================
# Cloud Storage for Backups
# =============================================================================

resource "google_storage_bucket" "backups" {
  name          = "godel-backups-${var.environment}-${var.gcp_project_id}"
  location      = var.gcp_region
  force_destroy = var.environment != "production"
  
  versioning {
    enabled = true
  }
  
  encryption {
    default_kms_key_name = google_kms_crypto_key.storage.id
  }
  
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = var.environment == "production" ? 90 : 30
    }
  }
  
  uniform_bucket_level_access = true
}

resource "google_kms_key_ring" "storage" {
  name     = "godel-storage-${var.environment}"
  location = var.gcp_region
}

resource "google_kms_crypto_key" "storage" {
  name            = "godel-storage-key"
  key_ring        = google_kms_key_ring.storage.id
  rotation_period = "7776000s"  # 90 days
}
