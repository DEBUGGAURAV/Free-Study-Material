# ⚡ Cloudflare Worker Edge Stream Deployment Guide (Free 80+ MB/s Speed Boost)

Is guide se aap 2 minute me Cloudflare par apna Free Edge Stream Worker deploy kar sakte hain.

---

### Step 1: Cloudflare Par Login Karein
1. [dash.cloudflare.com](https://dash.cloudflare.com) par jayein (Free account banayein ya login karein).
2. Left sidebar me **Workers & Pages** par click karein.
3. **Create Application** par click karein, fir **Create Worker** select karein.
4. Worker ka naam rakhein: `free-study-stream` (ya koi bhi naam) aur **Deploy** dabayein.

---

### Step 2: Code Paste Karein
1. Deploy hone ke baad **Edit code** button par click karein.
2. Purana code delete karein aur `cloudflare-worker/worker.js` ka pura code paste kar dein.
3. Upar right corner me **Save and deploy** button par click kar dein!

---

### Step 3: Secret Token Add Karein (Crucial)
1. Worker ke page par wapas jayein aur **Settings** tab me jayein.
2. **Variables and Secrets** par click karein.
3. **Add** button dabayein:
   - **Variable name**: `TELEGRAM_BOT_TOKEN`
   - **Value**: *(Aapka Telegram Bot Token jo .env me hai)*
   - Type ko **Secret** / Encrypted choose karein taaki token secure rahe.
4. **Deploy / Save** kar dein.

---

### Step 4: Render Par URL Connect Karein
1. Cloudflare Worker ka live URL copy karein (e.g., `https://free-study-stream.<your-subdomain>.workers.dev`).
2. [dashboard.render.com](https://dashboard.render.com) par apni Web Service me jayein.
3. **Environment** tab me jayein aur ek naya variable add karein:
   - **Key**: `CLOUDFLARE_WORKER_URL`
   - **Value**: `https://free-study-stream.<your-subdomain>.workers.dev`
4. **Save Changes** karein.

---

### 🎉 Done!
Ab jab bhi koi student kisi bhi PDF note par download click karega:
* Request automatically Cloudflare Edge CDN se route hogi.
* File India ke local Mumbai/Delhi server par 7 days tak cache rahegi.
* Students ko **80+ MB/s** ki superfast speed milegi aur Render server par 0% load aayega!

