import os
import platform
import sys
from PyInstaller.__main__ import run as pyinstaller_run

def build_executable():
    # Determine if we're on Windows to add .exe extension
    # executable_name = 'backend.exe' if platform.system() == 'Windows' else 'backend'

    # Ensure resources/python directory exists
    output_dir = '../resources/python'
    os.makedirs(output_dir, exist_ok=True)

    try:
        # Use PyInstaller library directly
        pyinstaller_run([
            '--onefile',
            '--name', 'backend',
            '--distpath', output_dir,
            '--workpath', './build',
            '--copy-metadata', 'cloudpathlib',
            '--hidden-import', 'tensorflow',
            '--collect-all', 'tensorflow',
            'main.py'
        ])

        print(f"Successfully built backend")

    except Exception as e:
        print(f"Error building executable: {e}")
        sys.exit(1)

if __name__ == '__main__':
    build_executable()
