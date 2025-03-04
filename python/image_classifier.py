from flask import Flask, request, jsonify
from flask_cors import CORS
import os
# from torchvision import models, transforms
from PIL import Image
# import torch
# import os
import socket
import argparse
from pathlib import Path
from bear import load_model, predict


app = Flask(__name__)
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})



# Load pre-trained ResNet model
# model = models.resnet50(pretrained=True)
# model.eval()

# # Image preprocessing
# transform = transforms.Compose([
#     transforms.Resize(256),
#     transforms.CenterCrop(224),
#     transforms.ToTensor(),
#     transforms.Normalize(
#         mean=[0.485, 0.456, 0.406],
#         std=[0.229, 0.224, 0.225]
#     )
# ])

# # Load ImageNet class labels
# with open(os.path.join(os.path.dirname(__file__), 'imagenet_classes.txt'), 'r') as f:
#     categories = [line.strip() for line in f.readlines()]

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        s.listen(1)
        port = s.getsockname()[1]
    return port

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "model": "ResNet50",
        # "num_categories": len(categories),
    }), 200

@app.route('/hello', methods=['POST'])
def hello():
    try:
        data = request.get_json()
        if not data or 'text' not in data:
            return jsonify({"error": "No text provided"}), 400

        text = data['text']
        response = f"Hellozzz, {text}"
        return jsonify({"message": response})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Initialize bear detection model
MODEL_FILEPATH_WEIGHTS = None
_bear_model = None

def get_bear_model():
    global _bear_model
    if _bear_model is None:
        _bear_model = load_model(MODEL_FILEPATH_WEIGHTS)
    return _bear_model

@app.route('/bear', methods=['GET'])
def detect_bear():
    try:
        image_path = request.args.get('path')  # restore query parameter
        #image_path = "/Users/iorek/dev/bear-detection/data/images/image1.jpg"
        if not image_path:
            return jsonify({"error": "No image path provided"}), 400

        path = Path(image_path)
        if not path.exists():
            return jsonify({"error": f"Image not found: {image_path}"}), 404

        try:
            image = Image.open(path)
            _, prediction_data = predict(model=get_bear_model(), pil_image=image)

            return jsonify({
                "image_path": str(path),
                "prediction": prediction_data
            })
        except Exception as e:
            print(e)
            return jsonify({
                "image_path": str(path),
                "error": str(e)
            }), 500

    except Exception as e:
        print(e)
        return jsonify({'error': str(e)}), 500

# @app.route('/classify', methods=['POST'])
# def classify_image():
#     try:
#         data = request.get_json()
#         if not data or 'image_paths' not in data:
#             return jsonify({"error": "No image paths provided"}), 400

#         image_paths = data['image_paths']
#         results = []

#         for image_path in image_paths:
#             try:
#                 if not os.path.exists(image_path):
#                     raise FileNotFoundError(f"Image not found: {image_path}")

#                 image = Image.open(image_path).convert('RGB')
#                 input_tensor = transform(image)
#                 input_batch = input_tensor.unsqueeze(0)

#                 with torch.no_grad():
#                     output = model(input_batch)

#                 probabilities = torch.nn.functional.softmax(output[0], dim=0)
#                 top5_prob, top5_catid = torch.topk(probabilities, 5)

#                 predictions = []
#                 for i in range(5):
#                     predictions.append({
#                         'category': categories[top5_catid[i]],
#                         'probability': float(top5_prob[i])
#                     })

#                 results.append({
#                     'image_path': image_path,
#                     'predictions': predictions
#                 })
#             except Exception as e:
#                 results.append({
#                     'image_path': image_path,
#                     'error': str(e)
#                 })

#         return jsonify(results)
#     except Exception as e:
#         return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, required=True, help='Port to run the server on')
    parser.add_argument('--resourcesPath', type=str, required=True, help='Path to resources with model')
    args = parser.parse_args()

    # Add directory listing
    print(f"\nListing contents of {args.resourcesPath}:")
    try:
        for item in os.listdir(args.resourcesPath):
            item_path = os.path.join(args.resourcesPath, item)
            if os.path.isdir(item_path):
                print(f"📁 {item}/")
                # List contents of subdirectory
                for subitem in os.listdir(item_path):
                    print(f"   └─ {subitem}")
            else:
                print(f"📄 {item}")
    except Exception as e:
        print(f"Error listing directory: {e}")

    MODEL_FILEPATH_WEIGHTS = Path(os.path.join(args.resourcesPath, "model/weights/model.pt"))

    print(f"Loading model from: {MODEL_FILEPATH_WEIGHTS}")

    print(f"Starting server on port: {args.port} with resources path: {args.resourcesPath}")
    app.run(port=args.port, debug=True)
