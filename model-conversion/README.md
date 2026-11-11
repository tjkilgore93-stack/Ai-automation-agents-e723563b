# Hyperfya Core AI model conversion

This component is deliberately separate from the Next.js/Supabase authentication application. It provides a small Python entry point for exporting a PyTorch module, applying the documented Core AI decomposition table, and converting it to an `AIProgram`.

## Compatibility warning

The supplied reference does not define artifact serialization or target-runtime loading. This pipeline returns the `AIProgram` object; it does not guess a save method or invent a file format. Add a writer adapter only after confirming the installed Core AI SDK's documented serialization API.

The `coreai_torch`, `coreai-core`, PyTorch, and Metal runtime versions must be chosen from the vendor's compatibility guidance. These dependencies are not pinned here because no verified version matrix was supplied.

## Model contract

Provide a Python module with:

- `build_model()`: returns a `torch.nn.Module`.
- `example_inputs()`: returns a tuple of sample positional inputs for `forward()`.

Example `my_model.py`:

```python
import torch
from torch import nn

class TinyModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.linear = nn.Linear(8, 4)

    def forward(self, features):
        return self.linear(features)

def build_model():
    return TinyModel().eval()

def example_inputs():
    return (torch.randn(1, 8),)
```

## Use

Run in an environment where the compatible PyTorch and Core AI packages are installed:

```bash
python -m pip install -e .
python -m hyperfya_coreai.convert --model-module my_model --input-names features --output-names logits
```

The command validates the module contract, exports/decomposes the model, converts it, and reports the resulting program type. It intentionally does not claim to write an artifact. Use the Python API to pass the returned program to a vendor-documented artifact writer.

## Python API

```python
from hyperfya_coreai.convert import convert_module

program = convert_module(
    model,
    sample_inputs=(sample_tensor,),
    input_names=["features"],
    output_names=["logits"],
)
# Serialize/load using the API documented by your installed Core AI SDK.
```

## Testing

Run the standard-library tests:

```bash
python -m unittest discover -s tests -v
```

These tests cover argument/configuration validation and do not require Core AI. A real conversion smoke test and numerical parity tests require the compatible vendor SDK and should run in a separate environment. Metal integration tests require supported Apple hardware and must not be treated as passing based on CPU-only CI.
