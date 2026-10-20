"""Export and convert a PyTorch module using the documented Core AI API.

This module intentionally does not serialize AIProgram because the supplied API
reference does not specify a supported serialization method or artifact format.
"""
from __future__ import annotations

import argparse
import importlib
from dataclasses import dataclass
from typing import Any, Sequence


@dataclass(frozen=True)
class ConversionConfig:
    """Explicit IO names for a single model entrypoint."""

    input_names: tuple[str, ...]
    output_names: tuple[str, ...]
    state_names: tuple[str, ...] = ()
    entrypoint_name: str = "main"

    def __post_init__(self) -> None:
        for field_name, values in (
            ("input_names", self.input_names),
            ("output_names", self.output_names),
            ("state_names", self.state_names),
        ):
            if any(not isinstance(name, str) or not name.strip() for name in values):
                raise ValueError(f"{field_name} must contain only non-empty strings")
            if len(set(values)) != len(values):
                raise ValueError(f"{field_name} must not contain duplicate names")
        if not isinstance(self.entrypoint_name, str) or not self.entrypoint_name.strip():
            raise ValueError("entrypoint_name must be a non-empty string")


def convert_module(
    module: Any,
    *,
    sample_inputs: Sequence[Any],
    input_names: Sequence[str],
    output_names: Sequence[str],
    state_names: Sequence[str] = (),
    entrypoint_name: str = "main",
    custom_kernels: Sequence[Any] = (),
) -> Any:
    """Export, decompose, and convert a torch.nn.Module into an AIProgram.

    Args:
        module: A torch.nn.Module instance.
        sample_inputs: Positional example inputs passed to torch.export.export.
        input_names: Names for non-stateful user inputs only.
        output_names: Names for non-state return values only.
        state_names: Names for mutable buffers and mutated user inputs in the
            exported graph's state ordering.
        entrypoint_name: Unique name for this staged program.
        custom_kernels: Optional TorchMetalKernel instances, registered before
            the exported program is staged.

    Returns:
        The AIProgram returned by TorchConverter.to_coreai().

    Raises:
        ImportError: If PyTorch or coreai_torch is not installed.
        ValueError: If the basic conversion configuration is invalid.
        Exception: Underlying export/conversion errors are intentionally
            propagated with their original traceback.
    """
    ConversionConfig(
        input_names=tuple(input_names),
        output_names=tuple(output_names),
        state_names=tuple(state_names),
        entrypoint_name=entrypoint_name,
    )
    if not isinstance(sample_inputs, (tuple, list)):
        raise ValueError("sample_inputs must be a tuple or list of positional inputs")

    try:
        import torch
        from coreai_torch import TorchConverter, get_decomp_table
    except ImportError as exc:
        raise ImportError(
            "Conversion requires compatible PyTorch and coreai_torch packages. "
            "Install versions supported by your Core AI SDK."
        ) from exc

    if not isinstance(module, torch.nn.Module):
        raise TypeError("module must be an instance of torch.nn.Module")

    exported = torch.export.export(module, args=tuple(sample_inputs))
    exported = exported.run_decompositions(get_decomp_table())

    converter = TorchConverter()
    if custom_kernels:
        converter.register_custom_kernels(list(custom_kernels))

    converter.add_exported_program(
        exported,
        input_names=list(input_names),
        output_names=list(output_names),
        state_names=list(state_names) if state_names else None,
        entrypoint_name=entrypoint_name,
    )
    return converter.to_coreai()


def _load_model_contract(module_name: str) -> tuple[Any, tuple[Any, ...]]:
    """Load build_model() and example_inputs() from a user module."""
    try:
        provider = importlib.import_module(module_name)
    except Exception as exc:
        raise RuntimeError(f"Could not import model module {module_name!r}") from exc

    build_model = getattr(provider, "build_model", None)
    example_inputs = getattr(provider, "example_inputs", None)
    if not callable(build_model) or not callable(example_inputs):
        raise ValueError(
            f"{module_name!r} must define callable build_model() and example_inputs()"
        )

    model = build_model()
    inputs = example_inputs()
    if not isinstance(inputs, (tuple, list)):
        raise ValueError("example_inputs() must return a tuple or list")
    return model, tuple(inputs)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export/decompose a PyTorch model and convert it to Core AI AIProgram."
    )
    parser.add_argument("--model-module", required=True, help="Importable Python module with build_model() and example_inputs().")
    parser.add_argument("--input-names", nargs="*", required=True, help="Names for non-state inputs in forward() order.")
    parser.add_argument("--output-names", nargs="*", required=True, help="Names for returned non-state outputs in tuple order.")
    parser.add_argument("--state-names", nargs="*", default=[], help="Names for mutable state in exported graph order.")
    parser.add_argument("--entrypoint-name", default="main")
    args = parser.parse_args()

    model, sample_inputs = _load_model_contract(args.model_module)
    program = convert_module(
        model,
        sample_inputs=sample_inputs,
        input_names=args.input_names,
        output_names=args.output_names,
        state_names=args.state_names,
        entrypoint_name=args.entrypoint_name,
    )
    print(
        "Conversion succeeded. "
        f"AIProgram type: {type(program).__module__}.{type(program).__qualname__}"
    )
    print(
        "No artifact file was written because the supplied Core AI reference "
        "does not document serialization. Use the installed SDK's supported writer."
    )


if __name__ == "__main__":
    main()
