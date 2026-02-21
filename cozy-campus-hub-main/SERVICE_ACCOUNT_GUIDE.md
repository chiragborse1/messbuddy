# 🔑 Firebase Service Account Guide (For Supabase)

To allow your Supabase backend to send notifications, you need a **Service Account JSON**. This is different from the `google-services.json` you already added.

### **Step 1: Generate the JSON**
1. Open [Firebase Console](https://console.firebase.google.com/).
2. Select your project (**cozy-campus**).
3. Click the **Gear icon (⚙️)** -> **Project settings**.
4. Go to the **Service accounts** tab.
5. Click the blue button: **Generate new private key**.
6. Download the JSON file to your computer.

### **Step 2: Add to Supabase Secrets**
Open your terminal in the project folder and run this command:
*(Replace `path/to/your-file.json` with the actual path to the file you just downloaded)*

```powershell
supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON="$(cat path/to/your-file.json)"
```

### **Step 3: Deploy the Function**
```powershell
supabase functions deploy send-notification
```

---
**Why is this needed?**
The `google-services.json` is for the **Frontend** (Android App) to receive messages.
The **Service Account JSON** is for the **Backend** (Supabase) to have permission to send them.
