# =============================================================================
# Godel Azure Infrastructure
# Production-ready AKS cluster with Azure Database and Cache
# =============================================================================

terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
  }
  
  backend "azurerm" {
    resource_group_name  = "godel-terraform-rg"
    storage_account_name = "godeltfstate"
    container_name       = "tfstate"
    key                  = "azure/terraform.tfstate"
  }
}

provider "azurerm" {
  features {
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
}

# =============================================================================
# Resource Group
# =============================================================================

resource "azurerm_resource_group" "main" {
  name     = "godel-${var.environment}-rg"
  location = var.azure_location
  
  tags = {
    Environment = var.environment
    Project     = "godel"
  }
}

# =============================================================================
# Virtual Network
# =============================================================================

resource "azurerm_virtual_network" "main" {
  name                = "godel-${var.environment}-vnet"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  address_space       = [var.vnet_cidr]
  
  tags = {
    Environment = var.environment
  }
}

resource "azurerm_subnet" "aks" {
  name                 = "aks-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.aks_subnet_cidr]
}

resource "azurerm_subnet" "database" {
  name                 = "database-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.db_subnet_cidr]
  
  service_endpoints = ["Microsoft.Sql"]
  
  delegation {
    name = "fs"
    service_delegation {
      name = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/join/action",
      ]
    }
  }
}

resource "azurerm_subnet" "cache" {
  name                 = "cache-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.cache_subnet_cidr]
}

# =============================================================================
# AKS Cluster
# =============================================================================

resource "azurerm_kubernetes_cluster" "main" {
  name                = "godel-${var.environment}-aks"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  dns_prefix          = "godel-${var.environment}"
  kubernetes_version  = "1.29"
  
  # System node pool
  default_node_pool {
    name                = "system"
    node_count          = var.node_count
    vm_size             = var.vm_size
    type                = "VirtualMachineScaleSets"
    zones               = [1, 2, 3]
    vnet_subnet_id      = azurerm_subnet.aks.id
    enable_auto_scaling = true
    min_count           = var.min_nodes
    max_count           = var.max_nodes
    
    node_labels = {
      workload = "system"
    }
    
    tags = {
      Environment = var.environment
    }
  }
  
  # Network profile (Azure CNI)
  network_profile {
    network_plugin    = "azure"
    network_policy    = "calico"
    load_balancer_sku = "standard"
    
    service_cidr   = var.service_cidr
    dns_service_ip = var.dns_service_ip
  }
  
  # Identity
  identity {
    type = "SystemAssigned"
  }
  
  # Azure AD integration
  azure_active_directory_role_based_access_control {
    managed                = true
    azure_rbac_enabled     = true
    admin_group_object_ids = var.aad_admin_group_ids
  }
  
  # Monitoring
  oms_agent {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  }
  
  # Microsoft Defender
  microsoft_defender {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  }
  
  # Maintenance window
  maintenance_window {
    allowed {
      day   = "Saturday"
      hours = [22, 23]
    }
    allowed {
      day   = "Sunday"
      hours = [0, 1, 2, 3, 4]
    }
  }
  
  # Auto-upgrade
  automatic_channel_upgrade = "stable"
  
  tags = {
    Environment = var.environment
  }
}

# User node pools
resource "azurerm_kubernetes_cluster_node_pool" "workload" {
  name                  = "workload"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.main.id
  vm_size               = var.workload_vm_size
  node_count            = 2
  
  zones          = [1, 2, 3]
  vnet_subnet_id = azurerm_subnet.aks.id
  
  enable_auto_scaling = true
  min_count           = 2
  max_count           = 20
  
  node_labels = {
    workload = "general"
  }
  
  node_taints = []
  
  tags = {
    Environment = var.environment
  }
}

resource "azurerm_kubernetes_cluster_node_pool" "spot" {
  name                  = "spot"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.main.id
  vm_size               = var.spot_vm_size
  node_count            = 0
  
  zones          = [1, 2, 3]
  vnet_subnet_id = azurerm_subnet.aks.id
  
  enable_auto_scaling = true
  min_count           = 0
  max_count           = 10
  priority            = "Spot"
  eviction_policy     = "Delete"
  spot_max_price      = -1
  
  node_labels = {
    workload = "spot"
    spot     = "true"
  }
  
  node_taints = [
    "spot=true:NoSchedule"
  ]
  
  tags = {
    Environment = var.environment
  }
}

# =============================================================================
# Log Analytics
# =============================================================================

resource "azurerm_log_analytics_workspace" "main" {
  name                = "godel-${var.environment}-logs"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = var.environment == "production" ? 90 : 30
  
  tags = {
    Environment = var.environment
  }
}

# =============================================================================
# Azure Database for PostgreSQL
# =============================================================================

resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "godel-${var.environment}-postgres"
  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  version                = "15"
  sku_name               = var.db_sku_name
  storage_mb             = 32768
  backup_retention_days  = var.environment == "production" ? 35 : 7
  geo_redundant_backup_enabled = var.environment == "production"
  
  administrator_login          = "godel_admin"
  administrator_password       = random_password.db_password.result
  
  zone = "1"
  
  high_availability {
    mode                      = "ZoneRedundant"
    standby_availability_zone = "2"
  }
  
  maintenance_window {
    day_of_week  = 0
    start_hour   = 3
    start_minute = 0
  }
  
  delegated_subnet_id = azurerm_subnet.database.id
  private_dns_zone_id = azurerm_private_dns_zone.postgres.id
  
  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgres]
  
  tags = {
    Environment = var.environment
  }
}

resource "azurerm_postgresql_flexible_server_database" "godel" {
  name      = "godel"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_postgresql_flexible_server_configuration" "extensions" {
  name      = "azure.extensions"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = "UUID-OSSP"
}

resource "random_password" "db_password" {
  length  = 32
  special = true
}

# Private DNS Zone for PostgreSQL
resource "azurerm_private_dns_zone" "postgres" {
  name                = "privatelink.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgres" {
  name                  = "postgres-dns-link"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.postgres.name
  virtual_network_id    = azurerm_virtual_network.main.id
}

# =============================================================================
# Azure Cache for Redis
# =============================================================================

resource "azurerm_redis_cache" "main" {
  name                = "godel-${var.environment}-redis"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  
  capacity            = var.redis_capacity
  family              = "P"
  sku_name            = var.redis_sku
  
  enable_non_ssl_port = false
  minimum_tls_version = "1.2"
  
  redis_configuration {
    maxmemory_policy = "allkeys-lru"
    
    rdb_backup_enabled            = true
    rdb_backup_frequency          = 60
    rdb_backup_max_snapshot_count = 1
  }
  
  patch_schedule {
    day_of_week    = "Tuesday"
    start_hour_utc = 3
  }
  
  zones = [1, 2]
  
  subnet_id = azurerm_subnet.cache.id
  
  tags = {
    Environment = var.environment
  }
}

# =============================================================================
# Storage Account for Backups
# =============================================================================

resource "azurerm_storage_account" "backups" {
  name                     = "godelbackup${var.environment}${random_string.storage_suffix.result}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = var.environment == "production" ? "GRS" : "LRS"
  
  enable_https_traffic_only = true
  min_tls_version           = "TLS1_2"
  
  blob_properties {
    versioning_enabled = true
    
    delete_retention_policy {
      days = var.environment == "production" ? 30 : 7
    }
    
    container_delete_retention_policy {
      days = var.environment == "production" ? 30 : 7
    }
  }
  
  network_rules {
    default_action             = "Deny"
    virtual_network_subnet_ids = [azurerm_subnet.aks.id]
    bypass                     = ["AzureServices"]
  }
  
  tags = {
    Environment = var.environment
  }
}

resource "azurerm_storage_container" "backups" {
  name                  = "backups"
  storage_account_name  = azurerm_storage_account.backups.name
  container_access_type = "private"
}

resource "random_string" "storage_suffix" {
  length  = 8
  special = false
  upper   = false
}
