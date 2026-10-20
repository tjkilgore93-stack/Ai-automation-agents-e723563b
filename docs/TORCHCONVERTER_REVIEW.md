# TorchConverter API review

## Scope and confidence

This review is based on the supplied API reference, not on an installed `coreai_torch` package or its implementation. Statements below distinguish visible documentation inconsistencies from behavior that must be verified against the actual package.

## Findings

### High priority: artifact serialization is undocumented

`to_coreai()` returns an `AIProgram`, but the reference does not document how to serialize, package, validate, or load that object on the target runtime. Do not assume `save()`, `export()`, or a file extension exists. The pipeline therefore returns the program object and leaves persistence to an explicit adapter using the installed Core AI SDK's documented API.

### High priority: the example for the custom-op lowering may not match registration names

The custom op is defined as `my_lib::scaled_add`, while the decorator registers `my_lib::scaled_add.default`. The docs say the argument is a qualified name in `namespace::op_name` form, but the example includes the overload suffix. Verify which exact key the installed converter dispatches on before relying on custom lowerings. Add an integration test for the real package.

### High priority: state IO ordering depends on observed FX behavior

The reference explicitly says state ordering (buffers first, then mutated user inputs) is observed behavior, not a stable PyTorch contract. Explicit `state_names` are necessary but are not sufficient if graph ordering changes silently. Inspect the exported graph signature and verify state input/output mapping on each supported PyTorch version.

### High priority: mutation semantics need runtime tests

The docs state that in-place mutation of user inputs is always modeled as state, and suggest cloning or out-of-place operations to avoid it. Test both buffer mutation and user-input mutation, including multiple state values and tuple outputs. Ensure the runtime applies mutation outputs back to the intended state slots.

### Medium priority: export/decomposition compatibility is version-sensitive

`run_decompositions(get_decomp_table())` is a mandatory precondition. The reference does not state supported PyTorch versions, export constraints, dynamic-shape support, or the package's compatibility matrix. Pin tested versions and fail early with a clear error if export/decomposition/conversion fails.

### Medium priority: custom Metal kernel constraints are underspecified

The example uses `src="output[id] = x[id] + y[id];"`, but does not document indexing bounds, tensor layout/strides, dtype conversion, shape broadcasting, thread-grid sizing, or device capability requirements. Validate kernel metadata against the target API and compare kernel results to the PyTorch reference on-device. Do not assume Metal is available on Linux CI.

### Medium priority: custom lowering examples need semantic and type validation

The adaptive-average-pooling override assumes static input/output dimensions, integer strides, and a pooling decomposition equivalent to adaptive average pooling. It may not handle non-divisible dimensions, dynamic shapes, or every valid output size. It also uses private APIs under `coreai._compiler`, which may change between releases. Keep such overrides isolated, version-pinned, and covered by numerical parity tests.

### Medium priority: naming rules are easy to misuse

`input_names` applies only to non-stateful inputs, `output_names` only to non-state outputs, and `state_names` maps each state input and its mutation output to one name. The reference should explicitly recommend checking list lengths and order against the exported graph signature before conversion. Names should be supplied explicitly for production artifacts.

### Low priority: API/documentation inconsistencies

- `externalize_modules` is typed as `list | None` but accepts `ExternalizeSpec` objects or bare class types; a more precise sequence type would clarify intended usage.
- The reference contains empty link targets such as `[IO Naming]()`; these are broken navigation.
- `register_custom_kernels()` must run before staging a program. This ordering is easy to miss and should be shown in every relevant end-to-end example.
- `clear()` preserves custom lowerings. Tests should lock in this lifecycle behavior, including clearing a subset of entrypoints.
- The constructor's no-program/no-lowering behavior is stated, but duplicate entrypoint handling and partial conversion failure behavior are not described.
- `get_decomp_table()` returns a fresh dictionary, which is good isolation; a test should confirm mutations do not leak between calls.

## Recommended acceptance tests

1. Stateless module converts and preserves expected input/output names.
2. Decomposition is applied before conversion.
3. Multiple entrypoints convert selectively and reject duplicate names clearly.
4. Stateful module verifies buffers and mutated user inputs map to the correct state names and order.
5. Custom lowering dispatch is tested with the exact registered operator overload name.
6. Custom kernel output matches PyTorch within documented dtype-specific tolerance on supported Apple hardware.
7. Unsupported operator errors include the qualified operator name and a useful remediation.
8. Conversion fails clearly when required optional dependencies or compatible hardware/runtime are unavailable.
9. Saved artifact can be loaded by the target runtime and passes numerical parity tests.
10. CI runs CPU-only unit tests separately from optional Apple Metal integration tests.

## Verdict

The overall flow is coherent, but the reference alone is not enough to promise a deployable artifact: serialization/runtime loading, version compatibility, state-order validation, and kernel semantics need confirmation. Start with a minimal stateless model and explicit IO names, then add stateful models, custom lowerings, and Metal kernels behind dedicated tests.
