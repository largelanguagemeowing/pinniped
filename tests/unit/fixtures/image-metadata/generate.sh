#!/usr/bin/env bash
# Regenerates the image metadata fixtures with independent writers (ImageMagick, exiv2, Pillow).
set -euo pipefail
cd "$(dirname "$0")"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

magick -size 64x48 gradient:red-blue exiv2.jpg
magick -size 16x12 xc:green exiv2-thumb.jpg
exiv2 \
  -M"set Exif.Image.Make Canon" -M"set Exif.Image.Model Canon EOS 5D" \
  -M"set Exif.Image.Orientation 6" -M"set Exif.Image.Artist Jane Doe" \
  -M"set Exif.Photo.BodySerialNumber 0123456789" \
  -M"set Exif.Photo.DateTimeOriginal 2024:05:01 12:34:56" \
  -M"set Exif.Photo.ExposureTime 1/125" -M"set Exif.Photo.FNumber 18/10" \
  -M"set Exif.Photo.UserComment charset=Unicode Grüße" \
  -M"set Exif.GPSInfo.GPSVersionID 2 2 0 0" \
  -M"set Exif.GPSInfo.GPSLatitudeRef N" -M"set Exif.GPSInfo.GPSLatitude 52/1 31/1 1234/100" \
  -M"set Exif.GPSInfo.GPSLongitudeRef W" -M"set Exif.GPSInfo.GPSLongitude 13/1 24/1 0/1" \
  -M"set Exif.GPSInfo.GPSAltitudeRef 1" -M"set Exif.GPSInfo.GPSAltitude 345/10" \
  -M"set Xmp.dc.creator Jane Doe" \
  exiv2.jpg
exiv2 -it exiv2.jpg # embeds exiv2-thumb.jpg as the EXIF thumbnail
rm exiv2-thumb.jpg

cat > "$tmp/pillow.py" <<'PY'
from PIL import Image, PngImagePlugin
from PIL.TiffImagePlugin import IFDRational as R

def exif(endian):
    e = Image.Exif()
    e._endian = endian
    e[0x010F] = "Apple"
    e[0x0110] = "iPhone 15"
    e[0x0131] = "17.1"
    e[0x9C9D] = "Jane".encode("utf-16le") + b"\0\0"  # XPAuthor
    sub = e.get_ifd(0x8769)
    sub[0x9003] = "2024:05:01 12:34:56"
    sub[0x829A] = R(1, 60)
    gps = e.get_ifd(0x8825)
    gps[1], gps[2] = "S", (R(33, 1), R(52, 1), R(4, 1))
    gps[3], gps[4] = "E", (R(151, 1), R(12, 1), R(36, 1))
    return e

img = Image.new("RGB", (32, 24), (200, 30, 30))
img.save("pillow-be.jpg", exif=exif(">"))
text = PngImagePlugin.PngInfo()
text.add_text("parameters", "a cat, masterpiece, Steps: 20")
text.add_itxt("Author", "Jürgen", lang="de", tkey="Autor")
img.save("pillow.png", pnginfo=text, exif=exif("<"))
img.save("pillow.webp", exif=exif("<"), xmp=b"<x:xmpmeta xmlns:x='adobe:ns:meta/'>creator</x:xmpmeta>")
img.save("plain.jpg")
img.save("plain.png")
PY
python3 -I "$tmp/pillow.py"
