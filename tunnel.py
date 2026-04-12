"""
Quick-start tunnel for public access.

Usage:
  python tunnel.py              # auto-detect cloudflared or ngrok
  python tunnel.py cloudflared  # force cloudflared
  python tunnel.py ngrok        # force ngrok

Prerequisites (install ONE):
  - cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
      winget install Cloudflare.cloudflared
  - ngrok:       https://ngrok.com/download
      winget install ngrok.ngrok
"""

import shutil
import subprocess
import sys

PORT = 8000


def run_cloudflared():
    print("[tunnel] Starting cloudflared tunnel -> localhost:{} ...".format(PORT))
    print("[tunnel] A free *.trycloudflare.com URL will appear below.\n")
    subprocess.run(["cloudflared", "tunnel", "--url", "http://localhost:{}".format(PORT)])


def run_ngrok():
    print("[tunnel] Starting ngrok tunnel -> localhost:{} ...".format(PORT))
    print("[tunnel] Your public URL will appear in the ngrok console.\n")
    subprocess.run(["ngrok", "http", str(PORT)])


def main():
    choice = sys.argv[1].lower() if len(sys.argv) > 1 else None

    if choice == "cloudflared" or (choice is None and shutil.which("cloudflared")):
        if not shutil.which("cloudflared"):
            sys.exit("[tunnel] cloudflared not found. Install: winget install Cloudflare.cloudflared")
        run_cloudflared()
    elif choice == "ngrok" or (choice is None and shutil.which("ngrok")):
        if not shutil.which("ngrok"):
            sys.exit("[tunnel] ngrok not found. Install: winget install ngrok.ngrok")
        run_ngrok()
    else:
        print("[tunnel] No tunnel tool found. Install one of:")
        print("  winget install Cloudflare.cloudflared   (free, no account needed)")
        print("  winget install ngrok.ngrok              (free tier, needs signup)")
        sys.exit(1)


if __name__ == "__main__":
    main()
