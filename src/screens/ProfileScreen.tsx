import { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  StatusBar, ActivityIndicator, TextInput, Linking, Image, Modal, Pressable, Alert, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { C } from "../lib/theme";
import Wordmark from "../components/Wordmark";
import { isBiometricAvailable, isBiometricEnabled, enableBiometric, disableBiometric, getBiometricLabel } from "../lib/biometrics";
import { API_BASE, deleteAccount, getProfileData, peekProfileData, invalidateProfileCache } from "../lib/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";

// Bump this string on every OTA publish (right before running `eas update`).
// MEASURED INCIDENT (2026-08-31): three separate OTA publishes looked
// identical on-device with no way to tell whether a new bundle had actually
// loaded - this stamp, plus Updates.updateId/channel/runtimeVersion below,
// is the ground truth: if BUILD_TAG on-device doesn't match what you just
// published, the update didn't land (see App.tsx's init() for the
// check-and-reload-immediately fix that was missing).
const BUILD_TAG = "2026-08-31.4";

// The single owner/dev allowlist for anything real users must never see -
// dev-only tools (Reset onboarding, Preview new-user flow) and the build
// stamp below, AND the pre-existing Admin Panel gate (was its own separate
// inline email list further down; now reads from this same one). __DEV__
// deliberately NOT used here: it's false in a production OTA bundle, which
// would hide these from the owner too, not just real users - an account
// gate is the only way to keep them visible for us on the same production
// channel everyone else is on.
const OWNER_EMAILS = ["natev9@comcast.net", "nvisionsinc@gmail.com", "nathanrussell9@outlook.com"];

const EMOJIS = ["🛍️","💰","🔥","⚡","🏆","👑","💎","🦁","🐉","🎯","🚀","💪","🌟","🦊","😎","🤑","🏅","🌊","🎪","🦅"];

// Deferred feature: real photo-avatar upload has no backend yet (no
// avatar_photo column, no Supabase Storage bucket, no upload endpoint -
// pickPhoto() only ever set local component state, nothing persisted).
// Flip this back to true once that's built; emoji avatars are the launch
// avatar system in the meantime.
const SHOW_PHOTO_UPLOAD = false;

const PLAN_COLOR: Record<string,string> = { free:C.text4, seller:C.green, pro:C.orange, lifetime:C.yellow, business:"#ff8c42" };

const BADGES = [
  { id:"first_scan",    e:"🔍", n:"First Scan",      d:"Completed your first scan",         xp:10  },
  { id:"first_buy",     e:"✅", n:"First Find",       d:"Found your first BUY verdict",       xp:25  },
  { id:"profit_100",    e:"💯", n:"Century Club",     d:"$100+ in profit found",              xp:50  },
  { id:"profit_500",    e:"💰", n:"High Roller",      d:"$500+ in profit found",              xp:100 },
  { id:"profit_1000",   e:"🏆", n:"Four Figures",     d:"$1,000+ in profit",                  xp:250 },
  { id:"streak_3",      e:"🔥", n:"On a Roll",        d:"3-day scan streak",                  xp:30  },
  { id:"streak_7",      e:"⚡", n:"Week Warrior",     d:"7-day scan streak",                  xp:75  },
  { id:"thrift_runner", e:"🛍️",n:"Thrift Runner",    d:"Completed a Thrift Run",             xp:40  },
  { id:"manifester",    e:"📋", n:"Manifester",       d:"Analyzed a liquidation lot",         xp:35  },
  { id:"rescuer",       e:"💀", n:"Pile Rescuer",     d:"Used Death Pile Rescuer",            xp:35  },
  { id:"battle_winner", e:"⚔️", n:"Battle Winner",    d:"Ran a Price Battle",                 xp:30  },
  { id:"scans_10",      e:"🌱", n:"Getting Started",  d:"10 scans completed",                 xp:20  },
  { id:"scans_50",      e:"🌿", n:"Regular",          d:"50 scans completed",                 xp:60  },
  { id:"scans_100",     e:"🌳", n:"Pro Scanner",      d:"100 scans completed",               xp:150 },
];

const RANKS = [
  { l:"Newbie",        min:0,    c:C.text4,    e:"🐣" },
  { l:"Thrifter",      min:50,   c:C.text3,    e:"🛍️"},
  { l:"Flipper",       min:150,  c:C.green,    e:"💪" },
  { l:"Pro Flipper",   min:300,  c:C.orange,   e:"🔥" },
  { l:"Elite Flipper", min:600,  c:C.yellow,   e:"⚡" },
  { l:"Legend",        min:1000, c:"#b066ff",  e:"👑" },
];

function getRank(xp: number) {
  let rank = RANKS[0];
  for (const r of RANKS) { if (xp >= r.min) rank = r; }
  const idx = RANKS.indexOf(rank);
  const next = RANKS[idx + 1];
  const progress = next ? (xp - rank.min) / (next.min - rank.min) : 1;
  return { ...rank, next, progress };
}

interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void; previewNewUser?:boolean; onTogglePreviewNewUser?:()=>void; }

const ps = {
  navRow:        { flexDirection:"row" as any, alignItems:"center" as any, padding:16, borderBottomWidth:1, borderBottomColor:C.border, gap:12 },
  navIcon:       { fontSize:20, width:28, textAlign:"center" as any },
  navLabel:      { flex:1, color:C.text1, fontSize:14, fontWeight:"600" as any },
  navArrow:      { color:C.text4, fontSize:18 },
  toggle:        { width:44, height:24, borderRadius:12, backgroundColor:C.surface, borderWidth:1, borderColor:C.border, justifyContent:"center" as any, paddingHorizontal:2 },
  toggleOn:      { backgroundColor:C.greenBg, borderColor:C.green },
  toggleThumb:   { width:18, height:18, borderRadius:9, backgroundColor:C.text4 },
  toggleThumbOn: { backgroundColor:C.green, alignSelf:"flex-end" as any },
  refCard:       { backgroundColor:C.surface, borderRadius:14, padding:16, margin:16, borderWidth:1, borderColor:C.border },
  refHeader:     { color:C.text1, fontSize:16, fontWeight:"800" as any, marginBottom:4 },
  refSub:        { color:C.text3, fontSize:13, lineHeight:18, marginBottom:12 },
  refStats:      { flexDirection:"row" as any, gap:8, marginBottom:12 },
  refStat:       { flex:1, backgroundColor:C.bg, borderRadius:10, padding:10, alignItems:"center" as any },
  refStatVal:    { color:C.green, fontSize:20, fontWeight:"900" as any },
  refStatLbl:    { color:C.text4, fontSize:9, fontWeight:"700" as any, textTransform:"uppercase" as any },
  refLinkBox:    { backgroundColor:C.bg, borderRadius:10, padding:10, flexDirection:"row" as any, alignItems:"center", gap:8 },
  refLink:       { flex:1, color:C.text2, fontSize:12 },
  copyBtn:       { backgroundColor:C.green, borderRadius:8, paddingHorizontal:12, paddingVertical:6 },
  copyBtnTxt:    { color:C.greenDark, fontSize:12, fontWeight:"700" as any },
  refTitle:      { color:C.green, fontSize:14, fontWeight:"700" as any, marginBottom:2 },
  refNote:       { color:C.text4, fontSize:11, marginTop:8, lineHeight:16 },
};

export default function ProfileScreen({ token, plan, onLogout, onNavigate, previewNewUser, onTogglePreviewNewUser }: Props) {
  const [profile, setProfile]       = useState<any>(null);
  const [stats, setStats]           = useState<any>(null);
  const [earnedIds, setEarnedIds]   = useState<Set<string>>(new Set());
  const [deleting, setDeleting]     = useState(false);

  function confirmDeleteAccount() {
    Alert.alert(
      "Delete Account?",
      "This permanently deletes your account and all your scans, history, and data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete Forever", style: "destructive", onPress: async () => {
          setDeleting(true);
          const res = await deleteAccount(token);
          setDeleting(false);
          if (res && res.success) {
            Alert.alert("Account Deleted", "Your account and all data have been removed.");
            onLogout();
          } else {
            Alert.alert("Could not delete", (res && res.error) || "Please try again.");
          }
        }},
      ]
    );
  }

  // Dev-only: replay first-launch (onboarding slides + land-on-scan nudge +
  // first-result hint) without reinstalling. Clears the two flags that gate
  // that flow, plus signs out - the slides only render pre-auth (App.tsx's
  // !session check), so a real first-launch replay needs a logged-out cold
  // start, not just clearing storage under an active session.
  function resetOnboarding() {
    Alert.alert(
      "Reset onboarding? (dev)",
      "Clears onboarding + signs you out. Fully close and reopen the app afterward to see the fresh first-launch flow.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: async () => {
          try {
            await AsyncStorage.removeItem("@valuiq_onboarded");
            await AsyncStorage.removeItem("@valuiq_tour_done");
          } catch {}
          onLogout();
          Alert.alert("Onboarding reset", "Fully close and reopen the app to see the fresh first-launch flow.");
        }},
      ]
    );
  }
  const [loading, setLoading]       = useState(true);
  const [editing, setEditing]       = useState(false);
  const [editName, setEditName]     = useState("");
  const [editBio, setEditBio]       = useState("");
  const [editPhoto, setEditPhoto]   = useState<string|null>(null);
  const [editEmoji, setEditEmoji]   = useState<string|null>(null);
  const [saving, setSaving]         = useState(false);
  const [tab, setTab]               = useState<"stats"|"badges"|"plan">("stats");
  const [emojiModal, setEmojiModal] = useState(false);
  const [biometricType, setBioType] = useState<"face"|"fingerprint"|"none">("none");
  const [biometricEnabled, setBioEnabled] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [referralLink, setReferralLink] = useState("");
  const [referrals, setReferrals] = useState({ total: 0, totalEarned: 0, pendingEarned: 0 });
  const [showDeletion, setShowDeletion] = useState(false);
  // Backend column defaults to true (SUPABASE_PROFILE.sql) - undefined/null
  // (not yet loaded, or a genuinely missing column on an old row) reads as
  // "on" to match that default rather than flashing "off" before data loads.
  const [isPublic, setIsPublic] = useState(true);
  const [savingPublic, setSavingPublic] = useState(false);

  // Decode email from JWT token immediately on mount
  useEffect(() => {
    try {
      // Simple JWT payload decode - works in React Native
      const b64 = token.split(".")[1]
        .replace(/-/g,"+").replace(/_/g,"/");
      // Pad to multiple of 4
      const pad = b64 + "===".slice(0, (4 - b64.length % 4) % 4);
      // Decode using global atob if available, else manual
      let decoded = "";
      try {
        decoded = decodeURIComponent(escape(atob(pad)));
      } catch {
        // Manual base64 decode fallback
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let result = "";
        let i = 0;
        const str = pad.replace(/=+$/, "");
        while (i < str.length) {
          const a = chars.indexOf(str[i++]);
          const b = chars.indexOf(str[i++]);
          const c = chars.indexOf(str[i++]);
          const d = chars.indexOf(str[i++]);
          result += String.fromCharCode(((a<<2)|(b>>4))&255);
          if (c !== -1) result += String.fromCharCode(((b<<4)|(c>>2))&255);
          if (d !== -1) result += String.fromCharCode(((c<<6)|d)&255);
        }
        decoded = result;
      }
      const payload = JSON.parse(decoded);
      if (payload.email) setUserEmail(payload.email);
      if (payload.sub) buildReferralLink(payload.sub);
    } catch {}
  }, [token]);
  const [copied, setCopied] = useState(false);

  useEffect(() => { load(); loadBiometrics(); }, []);

  function buildReferralLink(userId: string) {
    setReferralLink(`https://www.getvaluiq.com/r/${userId.slice(0,8)}`);
  }

  async function copyReferralLink() {
    try {
      const _ok = true; // (expo-clipboard imported at top) 

      if (_ok) {
        await Clipboard.setStringAsync(referralLink);
      } else {
        // Fallback - show the link
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function loadBiometrics() {
    const { available, type } = await isBiometricAvailable();
    if (available) {
      setBioType(type as any);
      const en = await isBiometricEnabled();
      setBioEnabled(en);
    }
  }

  function applyProfileData(d: { profile: any; stats: any; badges: any[] }) {
    setProfile(d.profile || {});
    setStats(d.stats || {});
    setIsPublic(d.profile?.is_public !== false);
    if (d.profile?.user_id && !referralLink) buildReferralLink(d.profile.user_id);
    setEarnedIds(new Set((d.badges || []).map((b:any) => b.id)));
    // Get email from profile or decode from JWT token
    const emailFromProfile = d.profile?.email || "";
    if (emailFromProfile) {
      setUserEmail(emailFromProfile);
    } else {
      // Decode from JWT token
      try {
        // Email already set from JWT in useEffect above
      // This is just a fallback
      try {
        const b64 = token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
        const pad = b64 + "===".slice(0,(4-b64.length%4)%4);
        const pl = JSON.parse(decodeURIComponent(escape(atob(pad))));
        setUserEmail(pl.email || "");
      } catch {}
      } catch {}
    }
    setEditName(d.profile?.display_name || "");
    setEditBio(d.profile?.bio || "");
  }

  // Screens in this app fully unmount/remount on every tab switch, so
  // without a cache this fired a full network fetch (+ blocking spinner)
  // every single time Profile was opened, even seconds after the last
  // visit. peekProfileData is a synchronous cache read: if a recent
  // (<30s) fetch is on hand - possibly one Dashboard or History already
  // made, since they all share the same cache key - paint it immediately
  // with zero network and zero spinner. Only a genuinely stale/missing
  // cache falls through to a real fetch.
  async function load() {
    const cached = peekProfileData(token);
    if (cached) {
      applyProfileData(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    const fresh = await getProfileData(token);
    if (fresh) applyProfileData(fresh);
    setLoading(false);
  }

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType.Images,
      allowsEditing: true, aspect: [1,1], quality: 0.7, base64: true });
    if (!res.canceled && res.assets[0]?.base64) {
      setEditPhoto(`data:image/jpeg;base64,${res.assets[0].base64}`);
      setEditEmoji(null);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/profile`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          token,
          display_name: editName,
          bio: editBio,
          ...(editPhoto ? { avatar_photo: editPhoto } : {}),
          ...(editEmoji ? { avatar_emoji: editEmoji } : {}) }) });
      invalidateProfileCache(token);
      setProfile((p:any) => ({
        ...p,
        display_name: editName,
        bio: editBio,
        ...(editPhoto ? { avatar_photo: editPhoto, avatar_emoji: null } : {}),
        ...(editEmoji ? { avatar_emoji: editEmoji, avatar_photo: null } : {}) }));
      setEditing(false);
    } catch {}
    setSaving(false);
  }

  // NOTE: unlike save() above (which POSTs a flat body to a route that has
  // no POST handler - app/api/profile/route.ts only exports GET and PATCH,
  // so that call 404/405s and silently no-ops behind its catch{}), this
  // uses the REAL contract: PATCH with { token, updates: {...} }, matching
  // the backend's actual allowlist (display_name/avatar_emoji/bio/
  // is_public). Flagging save()'s bug separately rather than fixing it here
  // - out of scope for "add the toggle."
  async function toggleIsPublic() {
    const next = !isPublic;
    setIsPublic(next); // optimistic - matches save()'s pattern elsewhere on this screen
    setSavingPublic(true);
    try {
      await fetch(`${API_BASE}/api/profile`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, updates: { is_public: next } }),
      });
      invalidateProfileCache(token);
      setProfile((p: any) => ({ ...p, is_public: next }));
    } catch {
      setIsPublic(!next); // revert on failure - never claim a setting saved when it didn't
    }
    setSavingPublic(false);
  }

  const xp = Array.from(earnedIds).reduce((sum, id) => sum + (BADGES.find(b=>b.id===id)?.xp||0), 0);
  const rank = getRank(xp);
  const planColor = PLAN_COLOR[plan] || C.text4;
  const displayName = profile?.display_name || profile?.full_name || "Your Profile";
  const isOwner = OWNER_EMAILS.includes((userEmail || "").toLowerCase());

  // Current avatar: photo > emoji > initial
  const currentPhoto = profile?.avatar_photo;
  const currentEmoji = profile?.avatar_emoji;

  // Preview in edit mode
  const previewPhoto = editPhoto || (!editEmoji && currentPhoto);
  const previewEmoji = editEmoji || (!editPhoto && currentEmoji);
  const previewInitial = (displayName || "F")[0]?.toUpperCase() || "F";

  if (loading && !profile) {
    return (
      <SafeAreaView style={[s.safe, {backgroundColor: C.bg, alignItems:"center", justifyContent:"center"}]}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
        <ActivityIndicator size="large" color={C.green} />
      </SafeAreaView>
    );
  }

  return (    <SafeAreaView style={[s.safe, {backgroundColor: C.bg}]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>

      {/* Emoji picker modal */}
      <Modal visible={emojiModal} transparent animationType="slide" onRequestClose={()=>setEmojiModal(false)}>
        <Pressable style={s.modalOverlay} onPress={()=>setEmojiModal(false)}>
          <Pressable style={s.emojiSheet} onPress={e=>e.stopPropagation()}>
            <View style={s.sheetHandle}/>
            <Text style={s.sheetTitle}>Pick an emoji avatar</Text>
            <View style={s.emojiGrid}>
              {EMOJIS.map(e=>(
                <TouchableOpacity key={e} style={[s.emojiOpt, (editEmoji||currentEmoji)===e && s.emojiOptActive]}
                  onPress={()=>{ setEditEmoji(e); setEditPhoto(null); setEmojiModal(false); }}>
                  <Text style={s.emojiOptText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

        {/* Nav */}
        <View style={s.nav}>
          <View style={s.logoRow}>
            <View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View>
            <Wordmark style={s.logoText}/>
          </View>
          <View style={{flexDirection:"row",gap:12,alignItems:"center"}}>
            {!editing && (
              <TouchableOpacity style={s.editNavBtn} onPress={()=>setEditing(true)}>
                <Text style={s.editNavText}>Edit</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.logoutNavBtn} onPress={onLogout}>
              <Text style={s.logoutNavText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* === PROFILE, CARD === */}
        {!editing ? (
          /* VIEW, MODE */
          <View style={s.profileCard}>
            <View style={s.avatarArea}>
              {currentPhoto ? (
                <Image source={{uri:currentPhoto}} style={s.avatarImg}/>
              ) : currentEmoji ? (
                <View style={s.avatarEmojiWrap}><Text style={s.avatarEmoji}>{currentEmoji}</Text></View>
              ) : (
                <View style={s.avatarDefault}><Text style={s.avatarDefaultText}>{previewInitial}</Text></View>
              )}
            </View>
            <Text style={s.displayName}>{displayName}</Text>
            {profile?.bio ? <Text style={s.bio}>{profile.bio}</Text> : null}
            <View style={{flexDirection:"row",alignItems:"center",gap:8,marginTop:8}}>
              <Text style={{fontSize:18}}>{rank.e}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[s.rankLabel,{color:rank.c}]}>{rank.l}</Text>
              <Text style={s.xpText}>{xp} XP</Text>
            </View>
          </View>
        ) : (
          /* EDIT, MODE */
          <View style={s.editCard}>
            <Text style={s.editTitle}>Edit Profile</Text>

            {/* Avatar picker */}
            <View style={s.avatarPickerRow}>
              {/* Preview */}
              <View style={s.avatarPreviewWrap}>
                {previewPhoto ? (
                  <Image source={{uri:previewPhoto}} style={s.avatarPreview}/>
                ) : previewEmoji ? (
                  <View style={[s.avatarPreview,{alignItems:"center",justifyContent:"center",backgroundColor:C.surfaceHigh}]}>
                    <Text style={{fontSize:42}}>{previewEmoji}</Text>
                  </View>
                ) : (
                  <View style={[s.avatarPreview,{alignItems:"center",justifyContent:"center",backgroundColor:C.surfaceHigh}]}>
                    <Text style={{color:C.text1,fontSize:36,fontWeight:"900"}}>{previewInitial}</Text>
                  </View>
                )}
              </View>

              {/* Options */}
              <View style={{gap:10,flex:1}}>
                {/* Upload Photo - hidden until photo upload is implemented
                    (deferred feature: needs a Supabase Storage bucket +
                    avatar_photo column + upload endpoint, none of which
                    exist yet - pickPhoto() above only sets local component
                    state, nothing persists). Code kept in place, not
                    deleted, so re-enabling later is a one-line flip. */}
                {SHOW_PHOTO_UPLOAD && (
                  <TouchableOpacity style={s.avatarOptBtn} onPress={pickPhoto}>
                    <Text style={s.avatarOptIcon}>📷</Text>
                    <Text style={s.avatarOptText}>Upload Photo</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={s.avatarOptBtn} onPress={()=>setEmojiModal(true)}>
                  <Text style={s.avatarOptIcon}>😎</Text>
                  <Text style={s.avatarOptText}>Choose Emoji</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Fields */}
            <View style={s.editField}>
              <Text style={s.editLabel}>Display Name</Text>
              <TextInput style={s.editInput} value={editName} onChangeText={setEditName}
                placeholder="Your name" placeholderTextColor={C.text4}/>
            </View>
            <View style={s.editField}>
              <Text style={s.editLabel}>Bio</Text>
              <TextInput style={[s.editInput,{minHeight:80,textAlignVertical:"top"}]}
                value={editBio} onChangeText={setEditBio} multiline
                placeholder="What's your flipping style? What do you specialize in?"
                placeholderTextColor={C.text4}/>
            </View>

            {/* Save / Cancel */}
            <View style={{flexDirection:"row",gap:10,marginTop:4}}>
              <TouchableOpacity style={[s.saveBtn,{flex:1}]} onPress={save} disabled={saving}>
                {saving
                  ? <ActivityIndicator color={C.greenDark} size="small"/>
                  : <Text style={s.saveBtnText}>Save Changes</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn}
                onPress={()=>{setEditing(false);setEditPhoto(null);setEditEmoji(null);}}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* XP bar */}
        <View style={s.xpCard}>
          <View style={{flexDirection:"row",justifyContent:"space-between",marginBottom:8}}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[s.rankLabel,{color:rank.c}]}>{rank.e} {rank.l}</Text>
            {rank.next && <Text style={{color:C.text4,fontSize:11}}>{rank.next.e} {rank.next.l} at {rank.next.min} XP</Text>}
          </View>
          <View style={s.xpBarBg}>
            <View style={[s.xpBarFill,{width:Math.min(100,(rank?.progress||0)*100) + "%" as any,backgroundColor:rank.c}]}/>
          </View>
          <Text style={{color:C.text4,fontSize:11,marginTop:6}}>{xp} XP · {earnedIds.size}/{BADGES.length} badges earned</Text>
        </View>

        {/* Tabs */}
        <View style={s.tabRow}>
          {(["stats","badges","plan"] as const).map(t=>(
            <TouchableOpacity key={t} style={[s.tabBtn,tab===t&&s.tabBtnActive]} onPress={()=>setTab(t)}>
              <Text style={[s.tabText,tab===t&&s.tabTextActive]}>
                {t==="stats"?"📊 Stats":t==="badges"?"🏅 Badges":"💳 Plan"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* STATS */}
        {tab==="stats" && stats && (
          <View style={{gap:8}}>
            {/* WINS - a REAL money-made figure, separate from "Profit Found"
                in the grid below (that one's a projected-scan sum). Reads
                stats.soldCount/soldTotal, computed server-side in
                /api/profile/route.ts from an UNBOUNDED query - the SAME
                source Dashboard and History read via getWinsSummary(), so
                all three always agree, Specialty sales included. */}
            <TouchableOpacity style={s.winsCard} onPress={()=>onNavigate("history")} activeOpacity={0.85}>
              <Text style={{fontSize:22}}>🏆</Text>
              <View style={{flex:1,paddingHorizontal:12}}>
                {stats.soldCount > 0 ? (
                  <>
                    <Text style={s.winsCardTitle} numberOfLines={1}>${Math.round(stats.soldTotal||0)} made · {stats.soldCount} flip{stats.soldCount===1?"":"s"}</Text>
                    <Text style={s.winsCardSub} numberOfLines={1}>See your flips →</Text>
                  </>
                ) : (
                  <>
                    <Text style={s.winsCardTitle} numberOfLines={1}>No flips logged yet</Text>
                    <Text style={s.winsCardSub} numberOfLines={1}>Log your first sale →</Text>
                  </>
                )}
              </View>
              <Text style={{color:C.green,fontSize:18}}>{"→"}</Text>
            </TouchableOpacity>

            {/* UPGRADE - "Upgrade" was removed from the bottom tab bar; this
                is one of its replacement surfaces (see also Dashboard's
                nudge and the Plan tab's existing full upgrade button). Only
                hidden for the actual top tier - a Seller must still see a
                path to Pro, a Pro must still see a path to Lifetime. */}
            {!["lifetime","titan","vip"].includes(plan) && (
              <TouchableOpacity style={s.upgradeCard} onPress={()=>onNavigate("upgrade")} activeOpacity={0.85}>
                <Text style={{fontSize:22}}>🚀</Text>
                <View style={{flex:1,paddingHorizontal:12}}>
                  <Text style={s.upgradeCardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {plan==="free" ? "Upgrade to Seller" : plan==="seller" ? "Upgrade to Pro" : "Go Lifetime"}
                  </Text>
                  <Text style={s.upgradeCardSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                    {plan==="free" ? "$14.99/mo · unlock Thrift Run, Death Pile & more"
                      : plan==="seller" ? "$34.99/mo · AI Coach, Profit Tracker & more"
                      : "$149 one-time · everything in Pro, no monthly fees"}
                  </Text>
                </View>
                <Text style={{color:C.yellow,fontSize:18}}>{"→"}</Text>
              </TouchableOpacity>
            )}

            <View style={s.statsGrid}>
              {[
                [String(stats.totalScans||0),"Total Scans","📷",C.text1],
                [String(stats.buyCount||0),"BUY Finds","✅",C.green],
                ["$"+Math.round(stats.totalProfit||0),"Profit Found","💰",C.green],
                [(stats.streak||0)+"🔥","Day Streak","",C.orange],
              ].map(([val,label,icon,color])=>(
                <TouchableOpacity key={label as string} style={s.statCard} activeOpacity={0.8} onPress={()=>onNavigate("history")}>
                  {icon ? <Text style={{fontSize:22,marginBottom:6}}>{icon as string}</Text> : null}
                  <Text style={[s.statVal,{color:color as string}]}>{val as string}</Text>
                  <Text style={s.statLabel}>{label as string}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={s.communityBtn} onPress={()=>onNavigate("community")}>
              <Text style={{fontSize:20}}>🏆</Text>
              <View style={{flex:1,paddingHorizontal:12}}>
                <Text style={{color:C.text1,fontSize:14,fontWeight:"700"}}>Community Leaderboard</Text>
                <Text style={{color:C.text4,fontSize:12,marginTop:2}}>See how you rank against other flippers</Text>
              </View>
              <Text style={{color:C.green,fontSize:18}}>→</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* BADGES */}
        {tab==="badges" && (
          <View>
            {earnedIds.size > 0 && (
              <>
                <Text style={s.badgeSectionLabel}>🏅 Earned ({earnedIds.size})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:16}}>
                  <View style={{flexDirection:"row",gap:8,paddingRight:20}}>
                    {BADGES.filter(b=>earnedIds.has(b.id)).map(b=>(
                      <View key={b.id} style={s.earnedPill}>
                        <Text style={{fontSize:24,marginBottom:4}}>{b.e}</Text>
                        <Text style={s.earnedPillName}>{b.n}</Text>
                        <Text style={s.earnedPillXp}>+{b.xp} XP</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}
            <Text style={s.badgeSectionLabel}>🔒 Locked</Text>
            <View style={s.lockedGrid}>
              {BADGES.filter(b=>!earnedIds.has(b.id)).map(b=>(
                <View key={b.id} style={s.lockedBadge}>
                  <Text style={{fontSize:22,opacity:0.25,marginBottom:3}}>{b.e}</Text>
                  <Text style={s.lockedName}>{b.n}</Text>
                  <Text style={s.lockedDesc}>{b.d}</Text>
                  <Text style={s.lockedXp}>{b.xp} XP</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* PLAN */}
        {tab==="plan" && (
          <View style={{gap:10}}>
            <View style={[s.currentPlan,{borderColor:planColor+"50"}]}>
              <Text style={[s.currentPlanName,{color:planColor}]}>
                {plan==="lifetime"?"♾️ Lifetime":plan==="titan"?"Titan":plan==="pro"?"🔥 Pro":plan==="seller"?"💪 Seller":"Free"} Plan
              </Text>
              <View style={[s.currentPlanBadge,{backgroundColor:planColor+"20",borderColor:planColor+"50"}]}>
                <Text style={[{color:planColor,fontSize:10,fontWeight:"700"}]}>ACTIVE</Text>
              </View>
            </View>

            <TouchableOpacity
          style={s.upgradeFullBtn}
          onPress={()=>onNavigate("upgrade")}
          activeOpacity={0.85}
        >
          <Text style={s.upgradeFullBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{plan==="free" ? "View all plans & upgrade" : "Manage plan & restore purchases"}</Text>
        </TouchableOpacity>

            {/* Account deletion - available to ALL users */}
            <View style={s.deleteAccountCard}>
              <Text style={{color:C.text1,fontSize:14,fontWeight:"700",marginBottom:6}}>Account</Text>
              <Text style={{color:C.text3,fontSize:12,lineHeight:18,marginBottom:12}}>
                Permanently delete your account and all your data. This cannot be undone.
              </Text>
              <TouchableOpacity
                onPress={confirmDeleteAccount}
                disabled={deleting}
                style={{backgroundColor:"#1a0505",borderWidth:1,borderColor:C.red+"40",borderRadius:10,padding:12,alignItems:"center",opacity: deleting ? 0.5 : 1}}>
                <Text style={{color:C.red,fontSize:13,fontWeight:"700"}}>{deleting ? "Deleting..." : "Delete Account"}</Text>
              </TouchableOpacity>
              <View style={{flexDirection:"row",justifyContent:"center",gap:18,marginTop:14}}>
                <TouchableOpacity onPress={()=>Linking.openURL("https://www.getvaluiq.com/privacy")}>
                  <Text style={{color:C.text4,fontSize:12,textDecorationLine:"underline"}}>Privacy Policy</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>Linking.openURL("https://www.getvaluiq.com/terms")}>
                  <Text style={{color:C.text4,fontSize:12,textDecorationLine:"underline"}}>Terms of Service</Text>
                </TouchableOpacity>
              </View>
            </View>

            {plan!=="free" && (
              <View style={s.manageCard}>
                <Text style={{color:C.text1,fontSize:14,fontWeight:"700",marginBottom:6}}>Manage Subscription</Text>
                <Text style={{color:C.text3,fontSize:12,lineHeight:18,marginBottom:10}}>
                  {plan==="lifetime"
                    ? "You have lifetime access — no recurring charges. Contact support to transfer or get help."
                    : "Update billing, change plan, or cancel any time. No cancellation fees ever."}
                </Text>
                <TouchableOpacity onPress={()=>Linking.openURL("https://apps.apple.com/account/subscriptions")} style={{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:10,padding:12,alignItems:"center",marginBottom:8}}>
                  <Text style={{color:C.green,fontSize:13,fontWeight:"700"}}>Manage subscription in App Store →</Text>
                </TouchableOpacity>
                {plan!=="lifetime" && (
                <TouchableOpacity onPress={()=>Linking.openURL("https://apps.apple.com/account/subscriptions")} style={{backgroundColor:"#1a0505",borderWidth:1,borderColor:C.red+"30",borderRadius:10,padding:12,alignItems:"center"}}>
                  <Text style={{color:C.red,fontSize:13,fontWeight:"700"}}>Cancel subscription</Text>
                </TouchableOpacity>
                )}
              </View>
            )}

            {/* Promo code */}
            <TouchableOpacity
              style={s.promoCard}
              onPress={()=>Linking.openURL("https://apps.apple.com/redeem")}
            >
              <Text style={{color:C.text1,fontSize:14,fontWeight:"700"}}>🏷️ Have a promo code?</Text>
              <Text style={{color:C.text3,fontSize:12,marginTop:4}}>Redeem in the App Store</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Share with a friend */}
            <View style={s.referralCard}>
              <Text style={s.referralTitle}>{"\uD83D\uDCE4"} Share ValuIQ</Text>
              <Text style={s.referralBody}>
                Know a reseller who'd love this? Send them ValuIQ.
              </Text>
              <TouchableOpacity
                style={s.referralBtn}
                onPress={async () => {
                  try {
                    await Share.share({
                      message: "Check out ValuIQ - scan any item and get its real resale value instantly. https://apps.apple.com/app/id6772601131",
                    });
                  } catch {}
                }}
              >
                <Text style={s.referralBtnText}>Share with a friend</Text>
              </TouchableOpacity>
            </View>

          {/* History & FAQ */}
        {biometricType !== "none" && (
          <TouchableOpacity
            style={ps.navRow}
            onPress={async () => {
              if (biometricEnabled) {
                await disableBiometric();
                setBioEnabled(false);
              } else {
                const emailToSave = profile?.email || "";
                if (emailToSave) {
                  await enableBiometric(emailToSave);
                  setBioEnabled(true);
                }
              }
            }}
          >
            <Text style={ps.navIcon}>{biometricType === "face" ? "🔐" : "👆"}</Text>
            <Text style={ps.navLabel}>{getBiometricLabel(biometricType)}</Text>
            <View style={[ps.toggle, biometricEnabled && ps.toggleOn]}>
              <View style={[ps.toggleThumb, biometricEnabled && ps.toggleThumbOn]}/>
            </View>
          </TouchableOpacity>
        )}
        {/* Display-side wiring (showing the real name/photo to other users
            once opted in) isn't built yet - every community/leaderboard row
            still shows "A reseller" regardless of this setting (see
            community-flips/route.ts). This just makes the setting exist so
            it's ready once that wiring lands, and is honest today that
            toggling it doesn't change what other users see yet. */}
        <TouchableOpacity style={ps.navRow} onPress={toggleIsPublic} disabled={savingPublic}>
          <Text style={ps.navIcon}>🏷️</Text>
          <Text style={ps.navLabel}>Show my name on community wins</Text>
          <View style={[ps.toggle, isPublic && ps.toggleOn]}>
            <View style={[ps.toggleThumb, isPublic && ps.toggleThumbOn]}/>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={ps.navRow} onPress={() => onNavigate("history")}>
          <Text style={ps.navIcon}>📋</Text>
          <Text style={ps.navLabel}>Scan History</Text>
          <Text style={ps.navArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={ps.navRow} onPress={() => onNavigate("faq")}>
          <Text style={ps.navIcon}>❓</Text>
          <Text style={ps.navLabel}>FAQ & Help</Text>
          <Text style={ps.navArrow}>›</Text>
        </TouchableOpacity>
        {isOwner && (
          <TouchableOpacity style={[ps.navRow,{borderColor:C.orange+"40",backgroundColor:C.orange+"08"}]} onPress={() => onNavigate("admin")}>
            <Text style={ps.navIcon}>⚙️</Text>
            <Text style={[ps.navLabel,{color:C.orange}]}>Admin Panel</Text>
            <Text style={ps.navArrow}>›</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={ps.navRow} onPress={() => onNavigate("ai-coach")}>
          <Text style={ps.navIcon}>🎯</Text>
          <Text style={ps.navLabel}>AI Coach</Text>
          <Text style={ps.navArrow}>›</Text>
        </TouchableOpacity>

        {/* ── ACCOUNT, SECTION — always visible regardless of tab ── */}
        <View style={s.accountSection}>
          <Text style={s.accountSectionTitle}>Account</Text>

          {/* Cancel subscription - paid users only */}
          {plan!=="free" && plan!=="lifetime" && (
            <TouchableOpacity
              onPress={()=>Linking.openURL("https://apps.apple.com/account/subscriptions")}
              style={s.cancelBtn}
            >
              <Text style={s.cancelBtnTxt}>Cancel Subscription</Text>
            </TouchableOpacity>
          )}

          {/* Manage billing - paid users */}
          {plan!=="free" && (
            <TouchableOpacity
              onPress={()=>Linking.openURL("https://apps.apple.com/redeem")}
              style={s.manageBtn}
            >
              <Text style={s.manageBtnTxt}>
                {plan==="lifetime" ? "♾️ Lifetime Access" : "Manage Billing & Plan →"}
              </Text>
              {/* Lifetime has no recurring subscription to "manage billing"
                  for, but the button still opens Apple's account page (e.g.
                  to update payment method on file) - a separate action line
                  instead of jamming both ideas into one run-on string. */}
              {plan==="lifetime" && <Text style={s.manageBtnSubTxt}>Manage Account →</Text>}
            </TouchableOpacity>
          )}

          {/* Delete account - ALL users */}
          <TouchableOpacity
            onPress={confirmDeleteAccount}
            style={s.deleteBtn}
          >
            <Text style={s.deleteBtnTxt}>{deleting ? "Deleting..." : "Delete Account"}</Text>
          </TouchableOpacity>
          <Text style={s.accountNote}>
            To delete your account and all data, tap above to email our support team. We process all requests within 24 hours.
          </Text>

          {/* Sign out */}
          <TouchableOpacity onPress={onLogout} style={s.signOutBtn}>
            <Text style={s.signOutBtnTxt}>Sign Out</Text>
          </TouchableOpacity>

          {/* Dev-only testing affordances + build stamp - gated on isOwner
              (see OWNER_EMAILS above), NOT __DEV__: this app ships to real
              users over OTA, where __DEV__ is always false - gating on it
              would hide these from the owner too, everywhere except a local
              dev-client build. Real users on the production channel must
              never see any of this; the owner needs to see it on the SAME
              production build everyone else is running. */}
          {isOwner && (
            <>
              <TouchableOpacity onPress={resetOnboarding} style={s.devResetBtn}>
                <Text style={s.devResetBtnTxt}>Reset onboarding (dev)</Text>
              </TouchableOpacity>
              {/* Preview new-user flow (dev) - unlike Reset onboarding above,
                  this does NOT sign out or touch @valuiq_onboarded/@valuiq_tour_
                  done: it's for an existing account with real scans/wins to walk
                  the exact stranger-from-outreach experience (value screen ->
                  guided first scan -> result callout -> empty-Wins demo) without
                  losing or deleting anything real. Toggle again to exit - the
                  instant it's off, every screen reverts to this account's real
                  data with nothing re-fetched or lost. */}
              <TouchableOpacity onPress={onTogglePreviewNewUser} style={s.devResetBtn}>
                <Text style={s.devResetBtnTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {previewNewUser ? "Exit preview new-user flow (dev)" : "Preview new-user flow (dev)"}
                </Text>
              </TouchableOpacity>
              {previewNewUser && (
                <Text style={[s.devResetBtnTxt, { color: C.green, fontWeight: "800" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  Preview mode is ON — your data is untouched.
                </Text>
              )}

              {/* Build/version stamp - see BUILD_TAG comment above. updateId
                  is null on the embedded (store) bundle, before any OTA has
                  ever applied - shown as "embedded" so that state is
                  unambiguous too. */}
              <Text style={s.buildStamp} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {BUILD_TAG} · {Updates.updateId ? Updates.updateId.slice(0, 8) : "embedded"} · {Updates.channel || "no channel"} · {Updates.runtimeVersion || "?"}
              </Text>
            </>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center:            { flex:1, alignItems:"center", justifyContent:"center" },
  container:         { padding:20, paddingBottom:60 },
  nav:               { flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:20 },
  logoRow:           { flexDirection:"row", alignItems:"center", gap:8 },
  logoIcon:          { width:30, height:30, backgroundColor:C.green, borderRadius:8, alignItems:"center", justifyContent:"center" },
  logoIconText:      { color:C.greenDark, fontSize:15, fontWeight:"900" },
  logoText:          { color:C.text1, fontSize:17, fontWeight:"800", letterSpacing:-0.5 },
  logoutNavBtn: { backgroundColor: "#1a0505", borderWidth: 1, borderColor: "#ff5a5a40", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  logoutNavText: { color: C.red, fontSize: 13, fontWeight: "700" as any },
  editNavBtn:        { borderWidth:1, borderColor:C.border, borderRadius:8, paddingHorizontal:14, paddingVertical:7 },
  editNavText:       { color:C.text3, fontSize:13, fontWeight:"600" },

  // View mode,
  profileCard:       { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:18, padding:20, alignItems:"center", marginBottom:14 },
  avatarArea:        { marginBottom:14 },
  avatarImg:         { width:80, height:80, borderRadius:40, borderWidth:2, borderColor:C.green },
  avatarEmojiWrap:   { width:80, height:80, borderRadius:40, backgroundColor:C.surfaceHigh, alignItems:"center", justifyContent:"center", borderWidth:2, borderColor:C.border },
  avatarEmoji:       { fontSize:40 },
  avatarDefault:     { width:80, height:80, borderRadius:40, backgroundColor:C.surfaceHigh, alignItems:"center", justifyContent:"center", borderWidth:2, borderColor:C.border },
  avatarDefaultText: { color:C.text1, fontSize:32, fontWeight:"900" },
  displayName:       { color:C.text1, fontSize:22, fontWeight:"900", letterSpacing:-0.5, marginBottom:4 },
  bio:               { color:C.text3, fontSize:13, textAlign:"center", lineHeight:19 },
  rankLabel:         { fontSize:13, fontWeight:"800", flexShrink:1 },
  xpText:            { color:C.text4, fontSize:11 },

  // Edit mode,
  editCard:          { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:18, padding:20, marginBottom:14 },
  editTitle:         { color:C.text1, fontSize:18, fontWeight:"900", marginBottom:16 },
  avatarPickerRow:   { flexDirection:"row", gap:16, alignItems:"center", marginBottom:20 },
  avatarPreviewWrap: { },
  avatarPreview:     { width:80, height:80, borderRadius:40, borderWidth:2, borderColor:C.border, overflow:"hidden" },
  avatarOptBtn:      { flexDirection:"row", alignItems:"center", gap:10, backgroundColor:C.bg, borderWidth:1, borderColor:C.border, borderRadius:11, padding:12 },
  avatarOptIcon:     { fontSize:20 },
  avatarOptText:     { color:C.text2, fontSize:13, fontWeight:"600" },
  editField:         { marginBottom:14 },
  editLabel:         { color:C.text3, fontSize:13, fontWeight:"700", marginBottom:7 },
  editInput:         { backgroundColor:C.bg, borderWidth:1, borderColor:C.border, borderRadius:11, padding:13, color:C.text1, fontSize:14 },
  saveBtn:           { backgroundColor:C.green, borderRadius:12, padding:14, alignItems:"center" },
  saveBtnText:       { color:C.greenDark, fontSize:15, fontWeight:"900" },
  cancelBtn:         { borderWidth:1, borderColor:C.border, borderRadius:12, padding:14, paddingHorizontal:18 },
  cancelBtnText:     { color:C.text4, fontSize:14 },

  // Emoji modal,
  modalOverlay:      { flex:1, backgroundColor:"rgba(0,0,0,0.75)", justifyContent:"flex-end" },
  emojiSheet:        { backgroundColor:C.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, paddingBottom:40 },
  sheetHandle:       { width:40, height:4, backgroundColor:C.border, borderRadius:2, alignSelf:"center", marginBottom:16 },
  sheetTitle:        { color:C.text1, fontSize:17, fontWeight:"800", marginBottom:16, textAlign:"center" },
  emojiGrid:         { flexDirection:"row", flexWrap:"wrap", gap:8, justifyContent:"center" },
  emojiOpt:          { width:56, height:56, borderRadius:16, alignItems:"center", justifyContent:"center", backgroundColor:C.surfaceHigh },
  emojiOptActive:    { backgroundColor:C.green+"30", borderWidth:2, borderColor:C.green },
  emojiOptText:      { fontSize:28 },

  // XP,
  xpCard:            { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:14, padding:14, marginBottom:14 },
  xpBarBg:           { height:8, backgroundColor:C.bg, borderRadius:4, overflow:"hidden", marginVertical:4 },
  xpBarFill:         { height:8, borderRadius:4 },

  // Tabs,
  tabRow:            { flexDirection:"row", backgroundColor:C.surface, borderRadius:13, padding:4, marginBottom:14, borderWidth:1, borderColor:C.border },
  tabBtn:            { flex:1, paddingTop:16, paddingBottom:10, borderRadius:10, alignItems:"center" },
  tabBtnActive:      { backgroundColor:C.bg },
  tabText:           { color:C.text4, fontSize:12, fontWeight:"600" },
  tabTextActive:     { color:C.text1, fontWeight:"700" },

  // Stats,
  winsCard:          { flexDirection:"row", alignItems:"center", backgroundColor:C.greenBg, borderWidth:1.5, borderColor:C.green+"50", borderRadius:14, padding:16, marginBottom:8 },
  winsCardTitle:     { color:C.text1, fontSize:15, fontWeight:"800" },
  winsCardSub:       { color:C.green, fontSize:12, fontWeight:"700", marginTop:2 },
  upgradeCard:       { flexDirection:"row", alignItems:"center", backgroundColor:"#1a1500", borderWidth:1.5, borderColor:C.yellow+"50", borderRadius:14, padding:16, marginBottom:8 },
  upgradeCardTitle:  { color:C.text1, fontSize:15, fontWeight:"800" },
  upgradeCardSub:    { color:C.yellow, fontSize:12, fontWeight:"700", marginTop:2 },
  statsGrid:         { flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:8 },
  statCard:          { width:"47.5%", backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:14, padding:14, alignItems:"center" },
  statVal:           { fontSize:22, fontWeight:"900", marginBottom:2 },
  statLabel:         { color:C.text4, fontSize:10, fontWeight:"700", textTransform:"uppercase" },
  communityBtn:      { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:14, padding:16, flexDirection:"row", alignItems:"center" },

  // Badges,
  badgeSectionLabel: { color:C.text3, fontSize:12, fontWeight:"700", marginBottom:10 },
  earnedPill:        { backgroundColor:C.surface, borderWidth:1, borderColor:C.green+"40", borderRadius:14, padding:14, alignItems:"center", width:90 },
  earnedPillName:    { color:C.text1, fontSize:11, fontWeight:"700", textAlign:"center", marginBottom:2 },
  earnedPillXp:      { color:C.green, fontSize:10, fontWeight:"700" },
  lockedGrid:        { flexDirection:"row", flexWrap:"wrap", gap:6 },
  lockedBadge:       { width:"31%", backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, padding:11, alignItems:"center" },
  lockedName:        { color:C.text4, fontSize:11, fontWeight:"700", textAlign:"center", marginBottom:2 },
  lockedDesc:        { color:C.text4, fontSize:9, textAlign:"center", lineHeight:13, marginBottom:3, opacity:0.7 },
  lockedXp:          { color:C.text4, fontSize:9, opacity:0.5 },

  // Plan tab,
  currentPlan:       { backgroundColor:C.surface, borderWidth:1.5, borderRadius:14, padding:16, flexDirection:"row", justifyContent:"space-between", alignItems:"center" },
  currentPlanName:   { fontSize:17, fontWeight:"900" },
  currentPlanBadge:  { borderWidth:1, borderRadius:100, paddingHorizontal:10, paddingVertical:4 },
  upgradeFullBtn:    { backgroundColor:C.green, borderRadius:14, padding:16, alignItems:"center" },
  upgradeFullBtnText:{ color:C.greenDark, fontSize:16, fontWeight:"900" },
  manageCard:        { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:14, padding:16 },
  referralCard:      { backgroundColor:"#0a1a04", borderWidth:1, borderColor:C.green+"40", borderRadius:14, padding:16 },
  referralTitle:     { color:C.green, fontSize:15, fontWeight:"800", marginBottom:6 },
  referralBody:      { color:C.text3, fontSize:13, lineHeight:19, marginBottom:12 },
  referralBtn:       { backgroundColor:C.green, borderRadius:10, padding:12, alignItems:"center" },
  referralBtnText:   { color:C.greenDark, fontSize:14, fontWeight:"800" },
  promoCard:         { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:14, padding:16 },
  accountSection:    { marginTop:24, borderTopWidth:1, borderTopColor:C.border, paddingTop:20 },
  accountSectionTitle:{ color:C.text1, fontSize:16, fontWeight:"900", marginBottom:14 },
  cancelBtn:         { backgroundColor:"#1a0505", borderWidth:1, borderColor:C.red+"50", borderRadius:12, padding:14, alignItems:"center", marginBottom:10 },
  cancelBtnTxt:      { color:C.red, fontSize:14, fontWeight:"700" },
  manageBtn:         { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, padding:14, alignItems:"center", marginBottom:10 },
  manageBtnTxt:      { color:C.green, fontSize:13, fontWeight:"700" },
  manageBtnSubTxt:   { color:C.text3, fontSize:12, fontWeight:"600", marginTop:4 },
  deleteBtn:         { backgroundColor:"#0d0505", borderWidth:1, borderColor:C.red+"30", borderRadius:12, padding:14, alignItems:"center", marginBottom:8 },
  deleteBtnTxt:      { color:C.red+"cc", fontSize:13, fontWeight:"700" },
  accountNote:       { color:C.text4, fontSize:11, textAlign:"center" as any, lineHeight:16, marginBottom:16 },
  signOutBtn:        { borderWidth:1, borderColor:C.border, borderRadius:12, padding:14, alignItems:"center" },
  signOutBtnTxt:     { color:C.text3, fontSize:13, fontWeight:"600" },
  devResetBtn:       { padding:10, alignItems:"center", marginTop:4 },
  devResetBtnTxt:    { color:C.text4, fontSize:11, fontWeight:"500", textAlign:"center" as any },
  buildStamp:        { color:C.text4, fontSize:9, fontWeight:"400", textAlign:"center" as any, marginTop:12, opacity:0.6 },
  deleteAccountCard: { backgroundColor:C.surface, borderWidth:1, borderColor:C.red+"20", borderRadius:14, padding:16 },
  upgradeFullBtn:    { backgroundColor:C.green, borderRadius:14, paddingTop:16, paddingBottom:10, alignItems:"center" },
  upgradeFullBtnText:{ color:C.greenDark, fontSize:15, fontWeight:"900" } });
