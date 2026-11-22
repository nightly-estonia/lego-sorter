"use strict";

const LEGOPhoto = {
    bindCamera(find, onPhoto, notify) {
        const open = find("camera");
        const preview = find("cameraPreview");
        const video = find("cameraVideo");
        const capture = find("takePhoto");
        let stream;
        let session = 0;

        function stop() {
            session++;
            stream?.getTracks().forEach(track => track.stop());
            stream = undefined;
            video.srcObject = null;
            preview.classList.add("hidden");
            open.disabled = false;
            capture.disabled = true;
        }

        open.onclick = async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
                notify("Kaamera avamiseks kasuta HTTPS-lehte või brauserit, mis toetab kaamerat.", true);
                return;
            }
            const attempt = ++session;
            open.disabled = true;
            preview.classList.remove("hidden");
            notify("Kaamera avamiseks luba brauseril kaamerat kasutada.");
            try {
                const requested = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: "environment" } },
                    audio: false,
                });
                if (attempt !== session) {
                    requested.getTracks().forEach(track => track.stop());
                    return;
                }
                stream = requested;
                video.srcObject = stream;
                await video.play();
                if (attempt !== session) return;
                capture.disabled = false;
                notify("Kadreeri foto ja vajuta „Pildista”.");
            } catch (error) {
                if (attempt !== session) return;
                stop();
                const messages = {
                    NotAllowedError: "Kaamera kasutamine on keelatud. Luba see brauseri saidiseadetes.",
                    NotFoundError: "Brauser ei leidnud kaamerat.",
                    NotReadableError: "Kaamera on hõivatud või sellele ei pääse ligi.",
                };
                notify(messages[error.name] || "Kaamerat ei õnnestunud avada. Proovi uuesti.", true);
            }
        };

        capture.onclick = async () => {
            const attempt = session;
            const { videoWidth: width, videoHeight: height } = video;
            if (!stream || !width || !height) return;
            capture.disabled = true;
            try {
                const scale = Math.min(1, 1600 / Math.max(width, height));
                const photo = await this.jpeg(video, 0, 0, width, height, scale);
                if (attempt !== session) return;
                stop();
                await onPhoto(photo);
            } catch (error) {
                if (attempt !== session) return;
                capture.disabled = false;
                notify(error.message, true);
            }
        };

        find("closeCamera").onclick = () => { stop(); notify(""); };
        window.addEventListener("pagehide", stop);
        return stop;
    },

    async prepare(file) {
        const url = URL.createObjectURL(file);
        const image = new Image();
        try {
            image.src = url;
            await image.decode();
            const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
            return await this.jpeg(image, 0, 0, image.naturalWidth, image.naturalHeight, scale);
        } catch {
            throw Error("Fotot ei õnnestunud avada. Kui fail on HEIC-vormingus, proovi JPG-, PNG-faili või ekraanipilti.");
        } finally {
            URL.revokeObjectURL(url);
        }
    },

    jpeg(image, x, y, width, height, scale = 1) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => blob ? resolve(blob) : reject(Error("Foto töötlemine ebaõnnestus.")), "image/jpeg", 0.88);
        });
    },

    findParts(image) {
        const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        const width = canvas.width = Math.round(image.naturalWidth * scale);
        const height = canvas.height = Math.round(image.naturalHeight * scale);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, width, height);
        return this.partBoxes(context.getImageData(0, 0, width, height).data, width, height);
    },

    partBoxes(pixels, width, height) {
        const patch = Math.max(1, Math.round(Math.min(width, height) * 0.04));
        const corners = [[0, 0], [width - patch, 0], [0, height - patch], [width - patch, height - patch]];
        const channels = [[], [], []];
        for (const [left, top] of corners) {
            for (let y = top; y < top + patch; y++) {
                for (let x = left; x < left + patch; x++) {
                    const offset = (y * width + x) * 4;
                    for (let channel = 0; channel < 3; channel++) channels[channel].push(pixels[offset + channel]);
                }
            }
        }
        const [red, green, blue] = channels.map(values => values.sort((a, b) => a - b)[values.length >> 1]);
        const mask = new Uint8Array(width * height);
        for (let index = 0; index < mask.length; index++) {
            const offset = index * 4;
            const distance = (pixels[offset] - red) ** 2
                + (pixels[offset + 1] - green) ** 2 + (pixels[offset + 2] - blue) ** 2;
            mask[index] = distance > 48 ** 2;
        }

        const queue = new Int32Array(mask.length);
        const minimumArea = Math.max(20, mask.length * 0.0007);
        const boxes = [];
        for (let start = 0; start < mask.length; start++) {
            if (!mask[start]) continue;
            mask[start] = 0;
            let end = 1;
            queue[0] = start;
            let left = width, right = 0, top = height, bottom = 0;
            for (let head = 0; head < end; head++) {
                const pixel = queue[head];
                const x = pixel % width;
                const y = Math.floor(pixel / width);
                left = Math.min(left, x);
                right = Math.max(right, x + 1);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y + 1);
                if (x > 0 && mask[pixel - 1]) { mask[pixel - 1] = 0; queue[end++] = pixel - 1; }
                if (x + 1 < width && mask[pixel + 1]) { mask[pixel + 1] = 0; queue[end++] = pixel + 1; }
                if (y > 0 && mask[pixel - width]) { mask[pixel - width] = 0; queue[end++] = pixel - width; }
                if (y + 1 < height && mask[pixel + width]) { mask[pixel + width] = 0; queue[end++] = pixel + width; }
            }
            const boxWidth = right - left;
            const boxHeight = bottom - top;
            if (end < minimumArea || boxWidth < 6 || boxHeight < 6
                || end < boxWidth * boxHeight * 0.2 || end > mask.length * 0.75) continue;
            const samples = [[], [], []];
            for (let index = 0; index < end; index += Math.max(1, Math.floor(end / 256))) {
                const offset = queue[index] * 4;
                for (let channel = 0; channel < 3; channel++) samples[channel].push(pixels[offset + channel]);
            }
            const rgb = samples.map(values => values.sort((a, b) => a - b)[values.length >> 1]);
            boxes.push({ rgb, left: left / width, right: right / width, top: top / height, bottom: bottom / height, area: end });
        }
        boxes.sort((a, b) => b.area - a.area);
        return boxes.slice(0, 15).sort((a, b) => a.top - b.top || a.left - b.left);
    },

    lab(rgb) {
        const [r, g, b] = rgb.map(value => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        const [x, y, z] = [
            (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047,
            r * 0.2126 + g * 0.7152 + b * 0.0722,
            (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883,
        ].map(value => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);
        return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
    },

    colorDistance(observed, hex) {
        if (!/^[0-9a-f]{6}$/i.test(hex || "")) return Infinity;
        const reference = this.lab(hex.match(/../g).map(channel => parseInt(channel, 16)));
        return Math.hypot((observed[0] - reference[0]) * 0.8, observed[1] - reference[1], observed[2] - reference[2]);
    },

    async predictPart(image, box, signal) {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        const pad = Math.max(8, Math.min((box.right - box.left) * width, (box.bottom - box.top) * height) * 0.15);
        const left = Math.max(0, box.left * width - pad);
        const top = Math.max(0, box.top * height - pad);
        const cropWidth = Math.min(width, box.right * width + pad) - left;
        const cropHeight = Math.min(height, box.bottom * height + pad) - top;
        const crop = await this.jpeg(image, left, top, cropWidth, cropHeight, Math.min(1, 800 / Math.max(cropWidth, cropHeight)));
        return this.predict(crop, "parts", signal);
    },

    async predict(photo, kind, signal) {
        const body = new FormData();
        body.append("query_image", photo, "lego.jpg");
        const timeout = AbortSignal.timeout(35000);
        let response;
        try {
            response = await fetch(`https://api.brickognize.com/predict/${kind}/?top_k_items=8`, {
                method: "POST",
                body,
                signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
            });
        } catch {
            throw Error("Brickognize’i tuvastusteenus ei vasta. Proovi uuesti.");
        }
        if (!response.ok) throw Error(`Brickognize’i tuvastus ebaõnnestus (HTTP ${response.status}).`);
        const result = await response.json();
        if (!Array.isArray(result.items)) throw Error("Brickognize tagastas vigase vastuse.");
        return result.items;
    },

    async suggestSets(photo, results, choose, notify, isCurrent) {
        results.replaceChildren();
        notify("Otsin fotolt komplekti…");
        const candidates = await this.predict(photo, "sets");
        if (!isCurrent()) return;
        const seen = new Set();
        for (const item of candidates) {
            const id = String(item.id ?? "");
            if (item.type !== "set" || !/^\d{3,8}(?:-\d+)?$/.test(id)) continue;
            const number = id.includes("-") ? id : id + "-1";
            if (seen.has(number)) continue;
            seen.add(number);
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = `${number} · ${item.name || "LEGO komplekt"}`;
            button.onclick = () => choose(number);
            results.append(button);
        }
        notify(seen.size
            ? "Vali sobiv komplekt. Seejärel laen Rebrickable’ist klotside nimekirja."
            : "Komplekti ei leitud. Proovi selget fotot karbi esiküljest või valmis mudelist või sisesta komplekti number.");
    },
};
