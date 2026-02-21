FROM node:18-bullseye-slim

# Opsiyonel: clamav (upload antivirüs taraması için)
# Build ederken açmak için:
#   docker build --build-arg INSTALL_CLAMAV=1 -t avukatim .
ARG INSTALL_CLAMAV=0

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-tur tesseract-ocr-eng poppler-utils \
  && if [ "$INSTALL_CLAMAV" = "1" ]; then \
       apt-get install -y --no-install-recommends clamav; \
     fi \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]
