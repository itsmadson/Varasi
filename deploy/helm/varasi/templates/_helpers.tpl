{{- define "varasi.labels" -}}
app.kubernetes.io/part-of: varasi
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "varasi.image" -}}
{{ .registry }}/varasi-{{ .name }}:{{ .tag }}
{{- end -}}
