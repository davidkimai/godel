/**
 * Service Outage Runbook
 * 
 * Procedures for handling partial or complete service outages.
 */

import { Runbook, RunbookStep } from './database-failure';

/**
 * Complete Service Outage Runbook
 * 
 * Use when: All services are unavailable
 * Impact: Complete system downtime
 * SLA Target: Recovery within 15 minutes
 */
export const CompleteOutageRunbook: Runbook = {
  id: 'outage-complete-001',
  title: 'Complete Service Outage',
  severity: 'critical',
  description: 'Procedures for recovering from complete service unavailability',
  prerequisites: [
    'Kubernetes cluster access',
    'Infrastructure provider access (AWS/GCP/Azure)',
    'PagerDuty/alerting acknowledgment',
  ],
  steps: [
    {
      id: '1',
      title: 'Acknowledge Incident',
      description: 'Acknowledge in PagerDuty and create incident channel',
      command: 'pagerduty incident:acknowledge',
      verification: 'Incident status shows acknowledged',
    },
    {
      id: '2',
      title: 'Check Infrastructure Status',
      description: 'Verify cloud provider status and cluster health',
      command: 'kubectl cluster-info',
      verification: 'Cluster shows healthy',
    },
    {
      id: '3',
      title: 'Check Node Status',
      description: 'Verify all nodes are ready',
      command: 'kubectl get nodes',
      verification: 'All nodes show Ready',
    },
    {
      id: '4',
      title: 'Check CoreDNS',
      description: 'Verify DNS resolution is working',
      command: 'kubectl get pods -n kube-system -l k8s-app=kube-dns',
      verification: 'CoreDNS pods are running',
    },
    {
      id: '5',
      title: 'Check Load Balancer',
      description: 'Verify external load balancer health',
      command: 'kubectl get svc ingress-nginx',
      verification: 'Load balancer has external IP',
    },
    {
      id: '6',
      title: 'Restart Ingress Controller',
      description: 'Restart ingress if needed',
      command: 'kubectl rollout restart deployment ingress-nginx-controller -n ingress-nginx',
      verification: 'New pods are running',
    },
    {
      id: '7',
      title: 'Check Database',
      description: 'Verify database connectivity',
      command: 'kubectl get pods -l app=postgres',
      verification: 'Database pod is running',
    },
    {
      id: '8',
      title: 'Check Redis',
      description: 'Verify cache layer',
      command: 'kubectl get pods -l app=redis',
      verification: 'Redis pods are running',
    },
    {
      id: '9',
      title: 'Restart Application',
      description: 'Rolling restart of application services',
      command: 'kubectl rollout restart deployment godel-api',
      verification: 'New pods are running and ready',
    },
    {
      id: '10',
      title: 'Verify Endpoints',
      description: 'Check all API endpoints respond',
      command: 'curl -f http://api.godel.ai/health',
      verification: 'Health endpoint returns 200',
    },
  ],
  postActions: [
    'Update status page',
    'Notify stakeholders',
    'Document root cause',
    'Schedule post-mortem',
  ],
};

/**
 * Partial Service Degradation Runbook
 * 
 * Use when: Some services are degraded but system is partially functional
 * Impact: Reduced capacity or functionality
 * SLA Target: Full recovery within 30 minutes
 */
export const PartialDegradationRunbook: Runbook = {
  id: 'outage-partial-001',
  title: 'Partial Service Degradation',
  severity: 'high',
  description: 'Procedures for handling partial service degradation',
  prerequisites: [
    'Kubernetes cluster access',
    'Monitoring dashboard access',
    'Escalation contacts',
  ],
  steps: [
    {
      id: '1',
      title: 'Identify Affected Services',
      description: 'Determine which services are degraded',
      command: 'kubectl get pods --all-namespaces | grep -v Running',
      verification: 'List of non-running pods identified',
    },
    {
      id: '2',
      title: 'Check Resource Usage',
      description: 'Review CPU and memory utilization',
      command: 'kubectl top nodes && kubectl top pods',
      verification: 'Resource bottlenecks identified',
    },
    {
      id: '3',
      title: 'Check Recent Deployments',
      description: 'Review recent changes that may have caused issue',
      command: 'kubectl rollout history deployment godel-api',
      verification: 'Recent deployment time correlates with issue',
    },
    {
      id: '4',
      title: 'Scale Affected Services',
      description: 'Increase replicas to handle load',
      command: 'kubectl scale deployment godel-api --replicas=5',
      verification: 'New pods are scheduled and running',
    },
    {
      id: '5',
      title: 'Check HPA Status',
      description: 'Verify horizontal pod autoscaler is functioning',
      command: 'kubectl get hpa',
      verification: 'HPA shows current/desired replicas',
    },
    {
      id: '6',
      title: 'Check for Resource Limits',
      description: 'Verify pods are not hitting resource limits',
      command: 'kubectl describe pods -l app=godel-api',
      verification: 'No OOMKilled or CPU throttling events',
    },
    {
      id: '7',
      title: 'Review Error Rates',
      description: 'Check application error logs',
      command: 'kubectl logs -l app=godel-api --tail=100 | grep ERROR',
      verification: 'Error patterns identified',
    },
    {
      id: '8',
      title: 'Consider Rollback',
      description: 'If recent deployment is cause, rollback',
      command: 'kubectl rollout undo deployment godel-api',
      verification: 'Previous version is running',
    },
  ],
  postActions: [
    'Monitor for 30 minutes',
    'Document findings',
    'Review auto-scaling policies',
    'Update alerting thresholds if needed',
  ],
};

/**
 * Cascade Failure Runbook
 * 
 * Use when: Failure in one service is causing cascading failures
 * Impact: Expanding scope of outage
 * SLA Target: Containment within 10 minutes
 */
export const CascadeFailureRunbook: Runbook = {
  id: 'outage-cascade-001',
  title: 'Cascade Failure Response',
  severity: 'critical',
  description: 'Emergency procedures for containing cascading failures',
  prerequisites: [
    'Circuit breaker configuration access',
    'Load balancer access',
    'Emergency contact list',
  ],
  steps: [
    {
      id: '1',
      title: 'Identify Root Service',
      description: 'Find the service where cascade originated',
      command: 'kubectl logs --all-containers -l app=godel-api --tail=50',
      verification: 'Root cause service identified',
    },
    {
      id: '2',
      title: 'Enable Circuit Breakers',
      description: 'Trip circuit breakers to contain failure',
      command: 'curl -X POST http://api.godel.ai/admin/circuit-breaker/enable',
      verification: 'Circuit breakers show OPEN state',
    },
    {
      id: '3',
      title: 'Isolate Failing Service',
      description: 'Remove failing service from load balancer',
      command: 'kubectl label pod -l app=failing-service isolated=true',
      verification: 'Service no longer receives traffic',
    },
    {
      id: '4',
      title: 'Enable Rate Limiting',
      description: 'Aggressive rate limiting to protect healthy services',
      command: 'kubectl apply -f k8s/emergency-rate-limits.yaml',
      verification: 'Rate limits are active',
    },
    {
      id: '5',
      title: 'Scale Down Affected Services',
      description: 'Reduce load on struggling services',
      command: 'kubectl scale deployment affected-service --replicas=1',
      verification: 'Only essential replicas remain',
    },
    {
      id: '6',
      title: 'Check Queue Depths',
      description: 'Verify queues are not backing up',
      command: 'redis-cli LLEN task-queue',
      verification: 'Queue depths are manageable',
    },
    {
      id: '7',
      title: 'Drain Excess Load',
      description: 'Process or discard queued items',
      command: 'ts-node scripts/drain-queues.ts --max-items=1000',
      verification: 'Queues at acceptable levels',
    },
    {
      id: '8',
      title: 'Stabilize Core Services',
      description: 'Ensure critical path services are healthy',
      command: 'kubectl get pods -l tier=core',
      verification: 'All core services healthy',
    },
  ],
  postActions: [
    'Keep circuit breakers in place until root cause fixed',
    'Plan gradual service restoration',
    'Document cascade pattern',
    'Review service dependencies',
  ],
};

export const ServiceOutageRunbooks = {
  CompleteOutage: CompleteOutageRunbook,
  PartialDegradation: PartialDegradationRunbook,
  CascadeFailure: CascadeFailureRunbook,
};

export default ServiceOutageRunbooks;
