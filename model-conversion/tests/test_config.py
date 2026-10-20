import unittest

from hyperfya_coreai.convert import ConversionConfig


class ConversionConfigTests(unittest.TestCase):
    def test_valid_stateless_config(self):
        config = ConversionConfig(
            input_names=("features",),
            output_names=("logits",),
        )
        self.assertEqual(config.entrypoint_name, "main")
        self.assertEqual(config.state_names, ())

    def test_rejects_empty_input_name(self):
        with self.assertRaisesRegex(ValueError, "input_names"):
            ConversionConfig(input_names=("",), output_names=("logits",))

    def test_rejects_duplicate_names_within_category(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            ConversionConfig(input_names=("x", "x"), output_names=("y",))

    def test_rejects_empty_entrypoint(self):
        with self.assertRaisesRegex(ValueError, "entrypoint_name"):
            ConversionConfig(input_names=(), output_names=(), entrypoint_name=" ")

    def test_allows_same_label_in_different_categories(self):
        config = ConversionConfig(
            input_names=("state",),
            output_names=("state",),
            state_names=("cache",),
        )
        self.assertEqual(config.input_names, ("state",))


if __name__ == "__main__":
    unittest.main()
