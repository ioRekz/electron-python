import sys

def process_text(input_text):
    return f"Hello, {input_text}"

if __name__ == "__main__":
    input_text = sys.argv[1]
    result = process_text(input_text)
    print(result)
