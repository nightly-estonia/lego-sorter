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

    async predict(photo, kind) {
        const body = new FormData();
        body.append("query_image", photo, "lego.jpg");
        let response;
        try {
            response = await fetch(`https://api.brickognize.com/predict/${kind}/?top_k_items=8`, {
                method: "POST",
                body,
                signal: AbortSignal.timeout(35000),
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
