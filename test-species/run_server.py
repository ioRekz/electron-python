from typing import Optional

import litserve as ls
from absl import app, flags
from fastapi import HTTPException
from speciesnet import DEFAULT_MODEL, SpeciesNet, file_exists

_PORT = flags.DEFINE_integer(
    "port",
    8000,
    "Port to run the server on.",
)
_API_PATH = flags.DEFINE_string(
    "api_path",
    "/predict",
    "URL path for the server endpoint.",
)
_WORKERS_PER_DEVICE = flags.DEFINE_integer(
    "workers_per_device",
    1,
    "Number of server replicas per device.",
)
_TIMEOUT = flags.DEFINE_integer(
    "timeout",
    30,
    "Timeout (in seconds) for requests.",
)
_BACKLOG = flags.DEFINE_integer(
    "backlog",
    2048,
    "Maximum number of connections to hold in backlog.",
)
_MODEL = flags.DEFINE_string(
    "model",
    DEFAULT_MODEL,
    "SpeciesNet model to load.",
)
_GEOFENCE = flags.DEFINE_bool(
    "geofence",
    True,
    "Whether to enable geofencing or not.",
)
_EXTRA_FIELDS = flags.DEFINE_list(
    "extra_fields",
    None,
    "Comma-separated list of extra fields to propagate from request to response.",
)


class SpeciesNetLitAPI(ls.LitAPI):
    """Core API to serve the SpeciesNet model.

    This class implements the server side of SpeciesNet by implementing LitAPI interface
    required by the `litserve` library. It handles request parsing, model loading,
    inference, and response formatting. This is a bridge between HTTP requests and the
    internal Python API for SpeciesNet.
    """

    def __init__(
        self,
        model_name: str,
        geofence: bool = True,
        extra_fields: Optional[list[str]] = None,
    ) -> None:
        """Initializes the SpeciesNet API server.

        Args:
            model_name:
                String value identifying the model to be loaded. It can be a Kaggle
                identifier (starting with `kaggle:`), a HuggingFace identifier (starting
                with `hf:`) or a local folder to load the model from.
            geofence:
                Whether to enable geofencing or not. Defaults to `True`.
            extra_fields:
                 Comma-separated list of extra fields to propagate from request to
                 response.
        """
        super().__init__()
        self.model_name = model_name
        self.geofence = geofence
        self.extra_fields = extra_fields or []

    def setup(self, device):
        del device  # Unused.
        self.model = SpeciesNet(self.model_name, geofence=self.geofence)

    def decode_request(self, request, context):
        del context  # Unused.
        for instance in request["instances"]:
            filepath = instance["filepath"]
            if not file_exists(filepath):
                raise HTTPException(400, f"Cannot access filepath: `{filepath}`")
        return request

    def _propagate_extra_fields(
        self, instances_dict: dict, predictions_dict: dict
    ) -> dict:
        predictions = predictions_dict["predictions"]
        new_predictions = {p["filepath"]: p for p in predictions}
        for instance in instances_dict["instances"]:
            for field in self.extra_fields:
                if field in instance:
                    new_predictions[instance["filepath"]][field] = instance[field]
        return {"predictions": list(new_predictions.values())}

    def predict(self, instances_dict, context):
        del context  # Unused.

        for instance in instances_dict["instances"]:
            filepath = instance["filepath"]
            batch_instances_dict = {"instances": [{"filepath": filepath}]}
            batch_predictions_dict = self.model.predict(
                instances_dict=batch_instances_dict
            )
            assert batch_predictions_dict is not None
            yield self._propagate_extra_fields(
                batch_instances_dict, batch_predictions_dict
            )

    # def predict(self, instances_dict, context):
    #     del context  # Unused.
    #     predictions_dict = self.model.predict(instances_dict=instances_dict)
    #     assert predictions_dict is not None
    #     return self._propagate_extra_fields(instances_dict, predictions_dict)

    def encode_response(self, output, context):
        del context  # Unused.
        for out in output:
            yield {"output": out}


def main(argv: list[str]) -> None:
    del argv  # Unused.

    api = SpeciesNetLitAPI(
        model_name=_MODEL.value,
        geofence=_GEOFENCE.value,
        extra_fields=_EXTRA_FIELDS.value,
    )
    server = ls.LitServer(
        api,
        accelerator="auto",
        devices="auto",
        workers_per_device=_WORKERS_PER_DEVICE.value,
        timeout=_TIMEOUT.value,
        api_path=_API_PATH.value,
        stream=True,
    )
    server.run(
        port=_PORT.value,
        generate_client_file=False,
        backlog=_BACKLOG.value,
    )


if __name__ == "__main__":
    app.run(main)
