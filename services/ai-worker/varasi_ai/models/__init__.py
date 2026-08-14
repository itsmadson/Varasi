"""Varasi model zoo — pluggable, runtime-tiered detection backends."""
from .base import ModelBackend, RunParams
from .registry import BACKENDS, catalog, get, resolve
from .router import route_and_run

__all__ = ["ModelBackend", "RunParams", "BACKENDS", "catalog", "get", "resolve", "route_and_run"]
