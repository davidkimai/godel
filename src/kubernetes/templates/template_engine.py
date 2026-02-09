#!/usr/bin/env python3
"""
Kata Pod Template Engine
Handles variable substitution and YAML validation for K8s pod templates.
"""

import re
import yaml
from pathlib import Path
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum


class ValidationError(Exception):
    """Raised when template validation fails."""
    pass


class RenderingError(Exception):
    """Raised when template rendering fails."""
    pass


@dataclass
class TemplateVariables:
    """Standard template variables for Kata pod generation."""
    AGENT_ID: str
    NAMESPACE: str = "default"
    IMAGE: str = "godel/agent:latest"
    CPU_LIMIT: str = "500m"
    MEMORY_LIMIT: str = "512Mi"
    ENV_VARS: str = ""
    VOLUME_MOUNTS: str = ""
    VOLUMES: str = ""
    
    def to_dict(self) -> Dict[str, str]:
        """Convert to dictionary for substitution."""
        return {
            "AGENT_ID": self.AGENT_ID,
            "NAMESPACE": self.NAMESPACE,
            "IMAGE": self.IMAGE,
            "CPU_LIMIT": self.CPU_LIMIT,
            "MEMORY_LIMIT": self.MEMORY_LIMIT,
            "ENV_VARS": self.ENV_VARS,
            "VOLUME_MOUNTS": self.VOLUME_MOUNTS,
            "VOLUMES": self.VOLUMES,
        }


class KataPodTemplateEngine:
    """Template engine for Kata pod YAML files."""
    
    def __init__(self, template_path: Optional[str] = None):
        """Initialize template engine with optional custom template path."""
        if template_path:
            self.template_path = Path(template_path)
        else:
            self.template_path = Path(__file__).parent / "kata-pod.yaml"
        
        self._template_content: Optional[str] = None
    
    def _load_template(self) -> str:
        """Load template content from file."""
        if not self.template_path.exists():
            raise FileNotFoundError(f"Template not found: {self.template_path}")
        
        self._template_content = self.template_path.read_text()
        return self._template_content
    
    def render(self, variables: TemplateVariables) -> str:
        """Render template with variable substitution."""
        template = self._template_content or self._load_template()
        
        var_dict = variables.to_dict()
        
        # Find missing variables
        pattern = r"\{\{(\w+)\}\}"
        matches = set(re.findall(pattern, template))
        missing = matches - set(var_dict.keys())
        
        if missing:
            raise RenderingError(f"Missing template variables: {missing}")
        
        # Substitute variables
        result = template
        for key, value in var_dict.items():
            placeholder = f"{{{{{key}}}}}"
            result = result.replace(placeholder, str(value))
        
        return result
    
    def validate_yaml(self, yaml_content: str) -> Dict[str, Any]:
        """Validate YAML syntax and structure."""
        try:
            parsed = yaml.safe_load(yaml_content)
        except yaml.YAMLError as e:
            raise ValidationError(f"Invalid YAML syntax: {e}")
        
        if not isinstance(parsed, dict):
            raise ValidationError("YAML must be a dictionary/object")
        
        # Validate required K8s fields
        required_fields = ["apiVersion", "kind", "metadata", "spec"]
        for field in required_fields:
            if field not in parsed:
                raise ValidationError(f"Missing required field: {field}")
        
        # Validate it's a Pod
        if parsed.get("kind") != "Pod":
            raise ValidationError(f"Expected kind 'Pod', got '{parsed.get('kind')}'")
        
        # Validate runtimeClassName
        spec = parsed.get("spec", {})
        if spec.get("runtimeClassName") != "kata":
            raise ValidationError("runtimeClassName must be 'kata'")
        
        return parsed
    
    def render_and_validate(self, variables: TemplateVariables) -> Dict[str, Any]:
        """Render template and validate result."""
        rendered = self.render(variables)
        return self.validate_yaml(rendered)
    
    def save_rendered(self, variables: TemplateVariables, output_path: str) -> Path:
        """Render template and save to file."""
        rendered = self.render(variables)
        self.validate_yaml(rendered)
        
        output = Path(output_path)
        output.write_text(rendered)
        return output


def format_env_vars(env_dict: Dict[str, str]) -> str:
    """Format environment variables for template insertion."""
    if not env_dict:
        return " []"

    lines = []
    for key, value in env_dict.items():
        lines.append("")
        lines.append(f"    - name: {key}")
        lines.append(f"      value: \"{value}\"")

    return "\n".join(lines)


def format_volume_mounts(mounts: Dict[str, str]) -> str:
    """Format volume mounts for template insertion."""
    if not mounts:
        return " []"

    lines = []
    for name, mount_path in mounts.items():
        lines.append("")
        lines.append(f"    - name: {name}")
        lines.append(f"      mountPath: {mount_path}")

    return "\n".join(lines)


def format_volumes(volumes: Dict[str, Dict[str, Any]]) -> str:
    """Format volumes for template insertion."""
    if not volumes:
        return " []"

    lines = []
    for name, config in volumes.items():
        lines.append("")
        lines.append(f"  - name: {name}")
        for key, value in config.items():
            if isinstance(value, dict):
                lines.append(f"    {key}:")
                for k, v in value.items():
                    lines.append(f"      {k}: {v}")
            else:
                lines.append(f"    {key}: {value}")

    return "\n".join(lines)


# Example usage
if __name__ == "__main__":
    engine = KataPodTemplateEngine()
    
    # Example with environment variables
    env_vars = format_env_vars({
        "LOG_LEVEL": "info",
        "AGENT_MODE": "secure",
        "KATA_ENABLED": "true"
    })

    volume_mounts = format_volume_mounts({
        "agent-config": "/etc/godel",
        "agent-data": "/var/lib/godel"
    })

    volumes = format_volumes({
        "agent-config": {
            "configMap": {"name": "godel-agent-config"}
        },
        "agent-data": {
            "emptyDir": {}
        }
    })
    
    variables = TemplateVariables(
        AGENT_ID="agent-001",
        NAMESPACE="godel-system",
        IMAGE="godel/agent:v1.2.3",
        CPU_LIMIT="1000m",
        MEMORY_LIMIT="1Gi",
        ENV_VARS=env_vars,
        VOLUME_MOUNTS=volume_mounts,
        VOLUMES=volumes
    )
    
    # Render and validate
    rendered = engine.render_and_validate(variables)
    print("✓ Template rendered and validated successfully")
    print(f"  Pod name: {rendered['metadata']['name']}")
    print(f"  Runtime: {rendered['spec']['runtimeClassName']}")
