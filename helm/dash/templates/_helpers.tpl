{{/*
Expand the name of the chart.
*/}}
{{- define "dash.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "dash.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "dash.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "dash.labels" -}}
helm.sh/chart: {{ include "dash.chart" . }}
{{ include "dash.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "dash.selectorLabels" -}}
app.kubernetes.io/name: {{ include "dash.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "dash.serviceAccountName" -}}
{{- if .Values.dashApi.serviceAccount.create }}
{{- default (include "dash.fullname" .) .Values.dashApi.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.dashApi.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
API labels
*/}}
{{- define "dash.apiLabels" -}}
{{ include "dash.labels" . }}
app.kubernetes.io/component: api
{{- end }}

{{/*
API selector labels
*/}}
{{- define "dash.apiSelectorLabels" -}}
{{ include "dash.selectorLabels" . }}
app.kubernetes.io/component: api
{{- end }}

{{/*
Dashboard labels
*/}}
{{- define "dash.dashboardLabels" -}}
{{ include "dash.labels" . }}
app.kubernetes.io/component: dashboard
{{- end }}

{{/*
Dashboard selector labels
*/}}
{{- define "dash.dashboardSelectorLabels" -}}
{{ include "dash.selectorLabels" . }}
app.kubernetes.io/component: dashboard
{{- end }}
