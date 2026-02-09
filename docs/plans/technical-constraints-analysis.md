# Technical Constraints Analysis - Godel Hypervisor Architecture

**Document ID:** SPEC-002-CONSTRAINTS  
**Date:** 2026-02-08  
**Status:** Ground Truth Technical Constraints  
**Based on:** Kata/Firecracker best practices + Agent_0C, Agent_0D, Agent_0E outputs

---

## Infrastructure Assessment

### Kubernetes Environment

| Component | Requirement | Status | Notes |
|-----------|-------------|--------|-------|
| **K8s Version** | 1.25+ | ✅ Required | Kata Containers requires K8s 1.24+ for runtimeClass stable |
| **Container Runtime** | containerd 1.6+ | ✅ Required | Kata works with containerd, CRI-O |
| **RuntimeClass** | kata enabled | ⚠️ Setup Required | Must install Kata Containers on all nodes |
| **Node OS** | Ubuntu 22.04 / RHEL 8+ | ✅ Supported | Kata supported on major Linux distributions |

### Kata Containers Prerequisites

```bash
# Node Requirements for Kata
- CPU: VT-x (Intel) or AMD-V (AMD) virtualization extensions
- Kernel: 5.10+ with KVM support
- Memory: 2GB+ per node for Kata overhead
- Storage: 10GB+ for Kata images and VMs
```

**Validation Command:**
```bash
# Check virtualization support
egrep -c '(vmx|svm)' /proc/cpuinfo  # Should return >0
lsmod | grep kvm  # Should show kvm module loaded
```

### Node Specifications (Target)

| Resource | Minimum | Recommended | Notes |
|----------|---------|-------------|-------|
| **CPU** | 8 cores | 16+ cores | Support 50-100 VMs per node |
| **Memory** | 32GB | 64GB+ | 2GB overhead + agent memory |
| **Disk** | 100GB SSD | 500GB NVMe | Fast I/O for VM snapshots |
| **Network** | 1Gbps | 10Gbps | Inter-VM and storage traffic |

---

## Network & Storage

### Network Policies

**Current State Assumptions:**
- Calico or Cilium CNI deployed
- NetworkPolicy resources supported
- Pod-to-pod communication controlled

**Required for Kata:**
```yaml
# Example: Allow Kata VM traffic
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: kata-vm-policy
spec:
  podSelector:
    matchLabels:
      runtime: kata
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: godel-control-plane
  egress:
  - to: []  # Restrict as needed
```

**Kata-Specific Networking:**
- VMs use virtio-net for network interfaces
- Each VM gets unique IP from pod CIDR
- Network policies apply at pod level (VM transparent)

### Storage Classes

**Available Options:**

| Storage Class | Use Case | Performance | Kata Support |
|---------------|----------|-------------|--------------|
| **local-ssd** | VM rootfs, temp data | High | ✅ Direct attach |
| **ebs-gp3** | Persistent volumes | Medium | ✅ Block device |
| **nfs-shared** | Shared data | Low | ✅ 9pfs/virtiofs |

**Kata Storage Architecture:**
- VM rootfs: Container image as virtio-blk device
- Ephemeral storage: tmpfs or sparse file
- Persistent volumes: Passed through as block devices
- Shared storage: 9pfs or virtiofs mount

---

## Operational Constraints

### CI/CD Integration Requirements

**Pipeline Stages:**
1. **Build:** Standard Docker image build
2. **Test:** Unit tests against RuntimeProvider interface
3. **Integration:** Tests with Kata runtime (requires K8s cluster)
4. **Security:** Image scanning, vulnerability assessment
5. **Deploy:** Helm chart deployment to staging/prod

**Kata-Specific CI Considerations:**
- Integration tests need K8s cluster with Kata
- Consider dedicated test cluster or Kind with Kata
- VM spawn tests require privileged CI runners

### Monitoring Stack

**Required Components:**

| Component | Purpose | Kata Integration |
|-----------|---------|------------------|
| **Prometheus** | Metrics collection | Kata shimv2 metrics endpoint |
| **Grafana** | Visualization | Custom dashboards for VM metrics |
| **Jaeger** | Distributed tracing | Trace across VM boundaries |
| **AlertManager** | Alerting | VM health, resource exhaustion |

**Kata Metrics Available:**
- VM start/stop latency
- Memory usage (VM + overhead)
- vCPU utilization
- Network I/O per VM
- Storage I/O per VM

### Resource Quotas

**Current Limits (Assumed):**
```yaml
# Per-namespace defaults
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

**Kata Adjustments Required:**
- Add Kata overhead (50-100MB per VM)
- Account for virtio overhead
- Separate VM count limit from pod count limit

---

## Blockers & Mitigations

| Blocker | Impact | Mitigation | Status |
|---------|--------|------------|--------|
| **Kata not installed** | HIGH | Install Kata 3.x on all nodes | ⚠️ Required Setup |
| **No virtualization support** | HIGH | Use cloud instances with nested virt | ⚠️ Verify nodes |
| **Kernel <5.10** | MEDIUM | Upgrade kernel or use older Kata | ⚠️ Check kernel |
| **Limited node resources** | MEDIUM | Scale cluster or reduce VM density | ✅ Plan scaling |
| **Network policy gaps** | MEDIUM | Audit and update policies | ⚠️ Security review |

---

## Kata + Firecracker Architecture

### Why Kata (Not Raw Firecracker)?

| Aspect | Raw Firecracker | Kata Containers | Winner |
|--------|-----------------|-----------------|--------|
| **Complexity** | High (custom tooling) | Low (standard K8s) | Kata ✅ |
| **Docker Support** | No | Yes | Kata ✅ |
| **K8s Integration** | Manual | Native | Kata ✅ |
| **Operational Overhead** | High | Low | Kata ✅ |
| **Debuggability** | Hard | Standard K8s tools | Kata ✅ |

**Kata Architecture:**
```
┌─────────────────────────────────────┐
│           Kubernetes Pod            │
│  ┌───────────────────────────────┐  │
│  │     Kata Container (VM)       │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │    Firecracker MicroVM  │  │  │
│  │  │  ┌───────────────────┐  │  │  │
│  │  │  │  Agent Container  │  │  │  │
│  │  │  │  (Standard Docker)│  │  │  │
│  │  │  └───────────────────┘  │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**Key Point:** Kata automates Firecracker VM management while preserving Docker/K8s compatibility.

---

## Recommendations for SPEC-002

### Section 2 (Architecture) - Include:
1. Kata Containers as primary runtime
2. Firecracker as underlying VMM (managed by Kata)
3. E2B as remote fallback option
4. Worktree as legacy compatibility layer

### Section 3 (Implementation) - Address:
1. K8s RuntimeClass configuration
2. Node prerequisites and validation
3. Network policy requirements
4. Storage class recommendations
5. Monitoring integration points

### Section 6 (Deployment) - Document:
1. Kata installation procedure
2. Node labeling for Kata workloads
3. Namespace setup with resource quotas
4. Monitoring stack configuration

---

**Document Generated By:** Agent_0B (Technical Architect)  
**Validation:** Cross-referenced with Kata 3.x documentation, Agent_0C (Risk), Agent_0D (API), Agent_0E (QA) outputs  
**Status:** ✅ Ground Truth Technical Constraints Established
