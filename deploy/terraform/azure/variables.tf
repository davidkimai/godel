# =============================================================================
# Azure Infrastructure Variables
# =============================================================================

variable "azure_location" {
  description = "Azure region for infrastructure"
  type        = string
  default     = "East US"
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
  
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'."
  }
}

variable "vnet_cidr" {
  description = "CIDR block for VNet"
  type        = string
  default     = "10.0.0.0/16"
}

variable "aks_subnet_cidr" {
  description = "CIDR block for AKS subnet"
  type        = string
  default     = "10.0.0.0/20"
}

variable "db_subnet_cidr" {
  description = "CIDR block for database subnet"
  type        = string
  default     = "10.0.16.0/24"
}

variable "cache_subnet_cidr" {
  description = "CIDR block for cache subnet"
  type        = string
  default     = "10.0.17.0/24"
}

variable "service_cidr" {
  description = "CIDR block for Kubernetes services"
  type        = string
  default     = "10.1.0.0/16"
}

variable "dns_service_ip" {
  description = "DNS service IP"
  type        = string
  default     = "10.1.0.10"
}

variable "vm_size" {
  description = "VM size for system node pool"
  type        = string
  default     = "Standard_D4s_v3"
}

variable "workload_vm_size" {
  description = "VM size for workload node pool"
  type        = string
  default     = "Standard_D8s_v3"
}

variable "spot_vm_size" {
  description = "VM size for spot node pool"
  type        = string
  default     = "Standard_D4s_v3"
}

variable "node_count" {
  description = "Initial node count"
  type        = number
  default     = 3
}

variable "min_nodes" {
  description = "Minimum nodes for autoscaling"
  type        = number
  default     = 2
}

variable "max_nodes" {
  description = "Maximum nodes for autoscaling"
  type        = number
  default     = 10
}

variable "db_sku_name" {
  description = "PostgreSQL SKU name"
  type        = string
  default     = "GP_Standard_D4s_v3"
}

variable "redis_sku" {
  description = "Redis SKU"
  type        = string
  default     = "Premium"
}

variable "redis_capacity" {
  description = "Redis capacity"
  type        = number
  default     = 1
}

variable "aad_admin_group_ids" {
  description = "Azure AD admin group object IDs"
  type        = list(string)
  default     = []
}
