import os
import platform
import sys
from PyInstaller.__main__ import run as pyinstaller_run

def build_executable():
    # Determine if we're on Windows to add .exe extension
    executable_name = 'backend.exe' if platform.system() == 'Windows' else 'backend'

    # Ensure resources/python directory exists
    output_dir = '../resources/python'
    os.makedirs(output_dir, exist_ok=True)

    try:
        # Use PyInstaller library directly
        pyinstaller_run([
            '--onefile',
            '--name', executable_name,
            '--distpath', output_dir,
            '--workpath', './build',
            'image_classifier.py'
        ])

        print(f"Successfully built {executable_name}")

    except Exception as e:
        print(f"Error building executable: {e}")
        sys.exit(1)

if __name__ == '__main__':
    build_executable()
