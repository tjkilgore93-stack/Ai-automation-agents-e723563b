"""Isolated PyTorch-to-Core-AI conversion helpers for Hyperfya."""

from .convert import ConversionConfig, convert_module

__all__ = ["ConversionConfig", "convert_module"]
