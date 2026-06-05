// expo-image-picker web stub - uses HTML file input on web
export const MediaTypeOptions = { Images: "images", Videos: "videos", All: "all" };

export async function launchImageLibraryAsync(options) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) { resolve({ canceled: true }); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result.split(",")[1];
        resolve({
          canceled: false,
          assets: [{ uri: ev.target.result, base64, type: "image", width: 800, height: 600 }]
        });
      };
      reader.readAsDataURL(file);
    };
    input.oncancel = () => resolve({ canceled: true });
    input.click();
  });
}

export async function launchCameraAsync(options) {
  return { canceled: true }; // Camera not available on web
}

export async function requestMediaLibraryPermissionsAsync() {
  return { granted: true };
}

export default { launchImageLibraryAsync, launchCameraAsync, MediaTypeOptions, requestMediaLibraryPermissionsAsync };
