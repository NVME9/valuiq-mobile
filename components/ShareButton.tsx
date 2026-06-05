import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Share, Linking, Modal, Pressable } from "react-native";
import { C } from "../lib/theme";

interface Props {
  message: string;
  title?: string;
  compact?: boolean;
}

const SOCIALS = [
  { id:"native",    label:"Share",      emoji:"📤", color:C.green  },
  { id:"copy",      label:"Copy",       emoji:"📋", color:C.text3  },
  { id:"twitter",   label:"X / Twitter",emoji:"𝕏",  color:"#1DA1F2"},
  { id:"facebook",  label:"Facebook",   emoji:"f",  color:"#1877F2"},
  { id:"instagram", label:"Instagram",  emoji:"📸", color:"#E1306C"},
  { id:"tiktok",    label:"TikTok",     emoji:"♪",  color:"#ff0050"},
  { id:"sms",       label:"Text",       emoji:"💬", color:C.green  },
];

export default function ShareButton({ message, title = "ValuIQ, Find", compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleShare(id: string) {
    setOpen(false);
    const encoded = encodeURIComponent(message);

    switch (id) {
      case "native":
        await Share.share({ message, title });
        break;
      case "copy":
        // Use, Share as clipboard fallback (Clipboard deprecated in newer RN)
        await Share.share({ message });
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        break;
      case "twitter":
        Linking.openURL(`https://twitter.com/intent/tweet?text=${encoded}`);
        break;
      case "facebook":
        Linking.openURL(`https://www.facebook.com/sharer/sharer.php?quote=${encoded}`);
        break;
      case "instagram":
        // Instagram doesn't support direct text sharing — open app,
        Share.share({ message, title });
        break;
      case "tiktok":
        Share.share({ message, title });
        break;
      case "sms":
        Linking.openURL(`sms:?body=${encoded}`);
        break;
    }
  }

  return (
    <>
      <TouchableOpacity
        style={compact ? s.compactBtn : s.shareBtn}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Text style={compact ? s.compactText : s.shareBtnText}>
          {copied ? "✓ Copied!" : "Share 📤"}
        </Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={e => e.stopPropagation()}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Share this find</Text>
            <Text style={s.sheetPreview} numberOfLines={3}>{message}</Text>
            <View style={s.socialsGrid}>
              {SOCIALS.map(soc => (
                <TouchableOpacity key={soc.id} style={s.socialBtn} onPress={() => handleShare(soc.id)} activeOpacity={0.7}>
                  <View style={[s.socialIcon, { backgroundColor: soc.color + "20", borderColor: soc.color + "40" }]}>
                    <Text style={[s.socialEmoji, { color: soc.color }]}>{soc.emoji}</Text>
                  </View>
                  <Text style={s.socialLabel}>{soc.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setOpen(false)}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  shareBtn:     { backgroundColor:C.surface, borderWidth:1, borderColor:C.green+"40", borderRadius:12, paddingVertical:13, alignItems:"center", marginTop:10 },
  shareBtnText: { color:C.green, fontSize:15, fontWeight:"800" },
  compactBtn:   { borderWidth:1, borderColor:C.border, borderRadius:9, paddingHorizontal:14, paddingVertical:7 },
  compactText:  { color:C.text2, fontSize:13, fontWeight:"700" },
  overlay:      { flex:1, backgroundColor:"rgba(0,0,0,0.7)", justifyContent:"flex-end" },
  sheet:        { backgroundColor:C.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, paddingBottom:40 },
  handle:       { width:40, height:4, backgroundColor:C.border, borderRadius:2, alignSelf:"center", marginBottom:18 },
  sheetTitle:   { color:C.text1, fontSize:18, fontWeight:"900", marginBottom:8 },
  sheetPreview: { color:C.text3, fontSize:13, lineHeight:19, backgroundColor:C.bg, borderRadius:10, padding:12, marginBottom:20 },
  socialsGrid:  { flexDirection:"row", flexWrap:"wrap", gap:12, marginBottom:20 },
  socialBtn:    { width:"30%", alignItems:"center", gap:6 },
  socialIcon:   { width:52, height:52, borderRadius:16, borderWidth:1, alignItems:"center", justifyContent:"center" },
  socialEmoji:  { fontSize:22, fontWeight:"900" },
  socialLabel:  { color:C.text3, fontSize:11, fontWeight:"600" },
  cancelBtn:    { backgroundColor:C.bg, borderRadius:14, padding:15, alignItems:"center" },
  cancelText:   { color:C.text3, fontSize:15, fontWeight:"700" },
});
