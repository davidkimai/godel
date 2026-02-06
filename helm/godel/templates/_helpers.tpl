{{/*
Expand the name of the chart.
*/}}
{{- define "godel.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "godel.fullname" -}}
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
{{- define "godel.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "godel.labels" -}}
helm.sh/chart: {{ include "godel.chart" . }}
{{ include "godel.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "godel.selectorLabels" -}}
app.kubernetes.io/name: {{ include "godel.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "godel.serviceAccountName" -}}
{{- if .Values.godelApi.serviceAccount.create }}
{{- default (include "godel.fullname" .) .Values.godelApi.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.godelApi.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
API labels
*/}}
{{- define "godel.apiLabels" -}}
{{ include "godel.labels" . }}
app.kubernetes.io/component: api
{{- end }}

{{/*
API selector labels
*/}}
{{- define "godel.apiSelectorLabels" -}}
{{ include "godel.selectorLabels" . }}
app.kubernetes.io/component: api
{{- end }}

{{/*
Dashboard labels
*/}}
{{- define "godel.godelboardLabels" -}}
{{ include "godel.labels" . }}
app.kubernetes.io/component: godelboard
{{- end }}

{{/*
Dashboard selector labels
*/}}
{{- define "godel.godelboardSelectorLabels" -}}
{{ include "godel.selectorLabels" . }}
app.kubernetes.io/component: godelboard
{{- end }}
