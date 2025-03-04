from pathlib import Path
from typing import Tuple

import numpy as np
from PIL import Image
from ultralytics import YOLO


def bgr_to_rgb(a: np.ndarray) -> np.ndarray:
    """
    Turn a BGR numpy array into a RGB numpy array when the array `a` represents
    an image.
    """
    return a[:, :, ::-1]


def prediction_to_str(yolo_prediction) -> str:
    """
    Turn the yolo_prediction into a human friendly string.
    """
    boxes = yolo_prediction.boxes
    classes = boxes.cls.cpu().numpy().astype(np.int8)
    n_bear = len([c for c in classes if c == 0])
    n_soft_coral = len([c for c in classes if c == 1])

    return f"""{len(boxes.conf)} bear detected! Trigger the bear repellent 🐻"""


def prediction_to_dict(yolo_prediction, image: Image.Image) -> dict:
    """
    Convert YOLO prediction to a JSON-serializable dictionary with normalized coordinates
    """
    boxes = yolo_prediction.boxes
    img_width, img_height = image.size

    return {
        'image_size': {
            'width': img_width,
            'height': img_height
        },
        'boxes': [{
            # Convert pixel coordinates to percentages
            'normalized': {
                'x1': float(box.xyxy.cpu().numpy()[0][0] / img_width),
                'y1': float(box.xyxy.cpu().numpy()[0][1] / img_height),
                'x2': float(box.xyxy.cpu().numpy()[0][2] / img_width),
                'y2': float(box.xyxy.cpu().numpy()[0][3] / img_height),
            },
            'pixels': box.xyxy.cpu().numpy().tolist()[0],  # original pixels
            'confidence': float(box.conf.cpu().numpy()[0]),
            'class_id': int(box.cls.cpu().numpy()[0])
        } for box in boxes],
        'speed': yolo_prediction.speed,
    }


def predict(model: YOLO, pil_image: Image.Image) -> Tuple[Image.Image, dict]:
    """
    Main interface function that runs the model on the provided pil_image.

    Args:
        model (YOLO): Loaded ultralytics YOLO model.
        pil_image (PIL): image to run inference on.

    Returns:
        pil_image_with_prediction (PIL): image with prediction from the model.
        prediction_data (dict): dictionary containing prediction details
    """
    predictions = model(pil_image)
    prediction = predictions[0]
    pil_image_with_prediction = Image.fromarray(bgr_to_rgb(prediction.plot()))
    prediction_data = prediction_to_dict(prediction, pil_image)

    return (pil_image_with_prediction, prediction_data)


def examples(dir_examples: Path) -> list[Path]:
    """
    List the images from the dir_examples directory.

    Returns:
        filepaths (list[Path]): list of image filepaths.
    """
    return list(dir_examples.glob("*.jpg"))


def load_model(filepath_weights: Path) -> YOLO:
    """
    Load the YOLO model given the filepath_weights.
    """
    return YOLO(filepath_weights)




# Main Gradio interface

MODEL_FILEPATH_WEIGHTS = Path("data/model/weights/model.pt")
DIR_EXAMPLES = Path("data/images/")
DEFAULT_IMAGE_INDEX = 1

# with gr.Blocks() as demo:
#     model = load_model(MODEL_FILEPATH_WEIGHTS)
#     image_filepaths = examples(dir_examples=DIR_EXAMPLES)
#     default_value_input = Image.open(image_filepaths[DEFAULT_IMAGE_INDEX])
#     input = gr.Image(
#         value=default_value_input,
#         type="pil",
#         label="input image",
#         sources=["upload", "clipboard"],
#     )
#     output_image = gr.Image(type="pil", label="model prediction")
#     output_raw = gr.Text(label="raw prediction")

#     fn = lambda pil_image: predict(model=model, pil_image=pil_image)
#     gr.Interface(
#         title="ML model for detecting bears from camera traps 🐻",
#         fn=fn,
#         inputs=input,
#         outputs=[output_image, output_raw],
#         examples=image_filepaths,
#         flagging_mode="never",
#     )

# demo.launch()
