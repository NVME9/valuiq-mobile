import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  StatusBar, ActivityIndicator, Alert, TextInput, Modal,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props {
  token: string; plan: string; scansLeft: number | null;
  setScansLeft: (n: number | null) => void;
  onNavigate: (s: string) => void; onBack?: () => void; onLogout: () => void;
}

const SUPER_ADMINS = ["NVisionsinc@gmail.com","Natev9@comcast.net","NathanRussell9@outlook.com",
  "nvisionsinc@gmail.com","natev9@comcast.net","nathanrussell9@outlook.com"];
const PLANS = ["free","seller","pro","lifetime","business"];

type Tab = "metrics" | "users" | "refunds" | "access";

export default function AdminScreen({ token, onNavigate, onBack }: Props) {
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [adminEmail,    setAdminEmail]    = useState("");
  const [stats,         setStats]         = useState<any>(null);
  const [tab,           setTab]           = useState<Tab>("metrics");
  const [users,         setUsers]         = useState<any[]>([]);
  const [usersLoading,  setUsersLoading]  = useState(false);
  const [search,        setSearch]        = useState("");
  const [selectedUser,  setSelectedUser]  = useState<any>(null);
  const [planModal,     setPlanModal]     = useState(false);
  const [refundReason,  setRefundReason]  = useState("");
  const [refundLoading, setRefundLoading] = useState(false);
  const [grantEmail,    setGrantEmail]    = useState("");
  const [expandedCard,  setExpandedCard]  = useState<string|null>(null);

  useEffect(() => { load(); }, []);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin?token=${token}`);
      const d = await r.json();
      if (d.authorized) {
        setAdminEmail(d.email || "");
        setStats(d);
        setUsers(d.users || []);
      }
    } catch {}
    setLoading(false); setRefreshing(false);
  }

  async function loadUsers(q = "") {
    setUsersLoading(true);
    try {
      const url = q
        ? `${API_BASE}/api/admin?token=${token}&search=${encodeURIComponent(q)}`
        : `${API_BASE}/api/admin?token=${token}`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.users) setUsers(d.users);
    } catch {}
    setUsersLoading(false);
  }

  async function changePlan(userId: string, newPlan: string) {
    try {
      const r = await fetch(`${API_BASE}/api/admin/set-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, userId, newPlan }),
      });
      const d = await r.json();
      if (d.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan: newPlan } : u));
        if (selectedUser?.id === userId) setSelectedUser((p: any) => ({ ...p, plan: newPlan }));
        Alert.alert("✅ Done", `Plan changed to ${newPlan}`);
        setPlanModal(false);
      } else {
        Alert.alert("Error", d.error || "Failed to change plan");
      }
    } catch { Alert.alert("Error", "Network error"); }
  }

  async function deleteUser(u: any) {
    Alert.alert(
      "Delete Account",
      `Permanently delete ${u.email}?\n\nThis removes their account, scans, and all data. Cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete Forever", style: "destructive", onPress: async () => {
          try {
            const r = await fetch(`${API_BASE}/api/admin?token=${token}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: u.id }),
            });
            const d = await r.json();
            if (d.success) {
              setUsers(prev => prev.filter(x => x.id !== u.id));
              Alert.alert("Deleted", "Account removed.");
            } else {
              Alert.alert("Error", d.error || "Deletion failed");
            }
          } catch { Alert.alert("Error", "Network error"); }
        }},
      ]
    );
  }

  async function issueRefund(prorated: boolean) {
    if (!selectedUser) return;
    setRefundLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, userId: selectedUser.id, reason: refundReason, prorated }),
      });
      const d = await r.json();
      if (d.success) {
        Alert.alert("✅ Refund Issued", d.message || "Refund processed.");
        setSelectedUser(null); setRefundReason("");
      } else {
        Alert.alert("Error", d.error || "Refund failed");
      }
    } catch { Alert.alert("Error", "Network error"); }
    setRefundLoading(false);
  }

  const isAdmin = SUPER_ADMINS.includes(adminEmail) || (adminEmail !== "" && stats?.authorized);

  if (loading) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}><ActivityIndicator color={C.green} size="large"/></View>
    </SafeAreaView>
  );

  if (!isAdmin) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>🔒</Text>
        <Text style={s.h2}>Access Denied</Text>
        <Text style={[s.body, { textAlign: "center", marginBottom: 20 }]}>
          Admin access required. Your email: {adminEmail || "not loaded"}
        </Text>
        <TouchableOpacity style={s.btn} onPress={onBack || (() => onNavigate("dashboard"))}>
          <Text style={s.btnTxt}>← Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  const METRIC_CARDS = stats ? [
    {
      key: "totalUsers",
      label: "Total Users",
      value: stats.totalUsers || 0,
      color: C.text1,
      detail: `${stats.totalUsers || 0} total registered accounts\n${stats.paidUsers || 0} paid · ${stats.freeUsers || 0} free`,
    },
    {
      key: "mrr",
      label: "MRR",
      value: `$${(stats.mrr || 0).toFixed(0)}`,
      color: C.green,
      detail: `Monthly Recurring Revenue: $${(stats.mrr || 0).toFixed(2)}\nAnnual Run Rate: $${((stats.mrr || 0) * 12).toFixed(0)}`,
    },
    {
      key: "paidUsers",
      label: "Paid",
      value: stats.paidUsers || 0,
      color: C.green,
      detail: (stats.planBreakdown || []).map((p: any) => `${p.plan}: ${p.count} users · $${p.revenue?.toFixed(0) || 0}/mo`).join("\n") || "No paid users yet",
    },
    {
      key: "freeUsers",
      label: "Free",
      value: stats.freeUsers || 0,
      color: C.text3,
      detail: `${stats.freeUsers || 0} users on free tier\nConvert to paid to grow MRR`,
    },
    {
      key: "scansToday",
      label: "Scans Today",
      value: stats.scansToday || 0,
      color: C.orange,
      detail: `${stats.scansToday || 0} scans in last 24 hours\n${stats.scansMonth || 0} scans this month`,
    },
    {
      key: "scansMonth",
      label: "Scans/Month",
      value: stats.scansMonth || 0,
      color: C.text1,
      detail: `${stats.scansMonth || 0} total scans this calendar month`,
    },
  ] : [];

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack || (() => onNavigate("dashboard"))} style={s.backBtn}>
          <Text style={s.backTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Admin Panel</Text>
        <TouchableOpacity onPress={() => load(true)} style={s.refreshBtn}>
          <Text style={s.refreshTxt}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {(["metrics","users","refunds","access"] as Tab[]).map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabIcon]}>
              {t === "metrics" ? "📊" : t === "users" ? "👥" : t === "refunds" ? "💸" : "🔑"}
            </Text>
            <Text style={[s.tabLbl, tab === t && s.tabLblActive]}>
              {t === "metrics" ? "Metrics" : t === "users" ? "Users" : t === "refunds" ? "Refunds" : "Access"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green}/>}
      >

        {/* ── METRICS TAB ── */}
        {tab === "metrics" && (
          <>
            <Text style={s.sectionLbl}>KEY METRICS · Tap any card for detail</Text>
            <View style={s.grid}>
              {METRIC_CARDS.map(card => (
                <TouchableOpacity
                  key={card.key}
                  style={[s.metricCard, expandedCard === card.key && { borderColor: C.green + "60" }]}
                  onPress={() => {
                    if (expandedCard === card.key) {
                      setExpandedCard(null);
                    } else {
                      setExpandedCard(card.key);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[s.metricVal, { color: card.color }]}>{card.value}</Text>
                  <Text style={s.metricLbl}>{card.label}</Text>
                  {expandedCard === card.key && (
                    <Text style={s.metricDetail}>{card.detail}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {stats?.planBreakdown && (
              <>
                <Text style={[s.sectionLbl, { marginTop: 20 }]}>PLAN BREAKDOWN</Text>
                {(stats.planBreakdown || []).map((p: any) => (
                  <View key={p.plan} style={s.row}>
                    <Text style={{ color: C.text1, fontWeight: "700", textTransform: "capitalize" }}>{p.plan}</Text>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: C.green, fontWeight: "700" }}>{p.count} users</Text>
                      {(p.revenue || 0) > 0 && <Text style={{ color: C.text4, fontSize: 11 }}>${(p.revenue || 0).toFixed(0)}/mo</Text>}
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* ── USERS TAB ── */}
        {tab === "users" && (
          <>
            <Text style={s.sectionLbl}>ALL USERS ({users.length})</Text>
            <View style={s.searchRow}>
              <TextInput
                style={s.searchInput}
                placeholder="Search by email or name..."
                placeholderTextColor={C.text4}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                returnKeyType="search"
                onSubmitEditing={() => loadUsers(search)}
              />
              <TouchableOpacity style={s.searchBtn} onPress={() => loadUsers(search)}>
                <Text style={{ color: C.greenDark, fontWeight: "900", fontSize: 13 }}>Search</Text>
              </TouchableOpacity>
            </View>
            {search.length > 0 && (
              <TouchableOpacity onPress={() => { setSearch(""); loadUsers(""); }} style={{ marginBottom: 10 }}>
                <Text style={{ color: C.text4, fontSize: 12 }}>✕ Clear search · Show all</Text>
              </TouchableOpacity>
            )}
            {usersLoading && <ActivityIndicator color={C.green} style={{ margin: 20 }}/>}
            {users.length === 0 && !usersLoading && (
              <Text style={[s.body, { textAlign: "center", marginTop: 20 }]}>No users found</Text>
            )}
            {users.map(u => (
              <View key={u.id} style={s.userCard}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={s.userEmail} numberOfLines={1}>{u.email}</Text>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 4, alignItems: "center" }}>
                    <View style={[s.planBadge, {
                      backgroundColor: u.plan === "free" ? C.surface : u.plan === "pro" ? C.green + "20" : C.orange + "20",
                      borderColor: u.plan === "free" ? C.border : u.plan === "pro" ? C.green + "50" : C.orange + "50",
                    }]}>
                      <Text style={{ color: u.plan === "free" ? C.text4 : u.plan === "pro" ? C.green : C.orange, fontSize: 10, fontWeight: "800", textTransform: "uppercase" }}>{u.plan}</Text>
                    </View>
                    <Text style={{ color: C.text4, fontSize: 11 }}>Joined {new Date(u.created_at).toLocaleDateString()}</Text>
                  </View>
                </View>
                <View style={{ gap: 5 }}>
                  <TouchableOpacity
                    style={s.actionBtn}
                    onPress={() => { setSelectedUser(u); setPlanModal(true); }}
                  >
                    <Text style={s.actionBtnTxt}>Plan ↕</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: "#ff1a1a10", borderColor: "#ff5a5a40" }]}
                    onPress={() => { setSelectedUser(u); setTab("refunds"); }}
                  >
                    <Text style={[s.actionBtnTxt, { color: C.red }]}>Refund</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: "#ff1a1a08", borderColor: "#ff5a5a30" }]}
                    onPress={() => deleteUser(u)}
                  >
                    <Text style={[s.actionBtnTxt, { color: "#ff5a5a" }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── REFUNDS TAB ── */}
        {tab === "refunds" && (
          <>
            <Text style={s.sectionLbl}>ISSUE REFUND</Text>
            {!selectedUser ? (
              <>
                <Text style={[s.body, { marginBottom: 14 }]}>
                  Go to the Users tab, find a user, and tap "Refund" to pre-select them here.
                  Or search by email below.
                </Text>
                <View style={s.searchRow}>
                  <TextInput
                    style={s.searchInput}
                    placeholder="User email..."
                    placeholderTextColor={C.text4}
                    value={search}
                    onChangeText={setSearch}
                    autoCapitalize="none"
                    returnKeyType="search"
                  />
                  <TouchableOpacity style={s.searchBtn} onPress={async () => {
                    try {
                      const r = await fetch(`${API_BASE}/api/admin?token=${token}&search=${encodeURIComponent(search)}`);
                      const d = await r.json();
                      if (d.users?.[0]) setSelectedUser(d.users[0]);
                      else Alert.alert("Not Found", "No user with that email.");
                    } catch {}
                  }}>
                    <Text style={{ color: C.greenDark, fontWeight: "900", fontSize: 13 }}>Find</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={s.selectedCard}>
                  <Text style={s.userEmail}>{selectedUser.email}</Text>
                  <Text style={[s.body, { marginTop: 4 }]}>Plan: {selectedUser.plan}</Text>
                  <TouchableOpacity onPress={() => setSelectedUser(null)} style={{ marginTop: 10 }}>
                    <Text style={{ color: C.text4, fontSize: 12 }}>✕ Clear</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.sectionLbl}>REASON (optional)</Text>
                <TextInput
                  style={[s.searchInput, { marginBottom: 16, height: 80 }]}
                  placeholder="Reason for refund..."
                  placeholderTextColor={C.text4}
                  value={refundReason}
                  onChangeText={setRefundReason}
                  multiline
                  textAlignVertical="top"
                />
                <View style={{ gap: 10 }}>
                  <TouchableOpacity style={[s.btn, { backgroundColor: C.green }]} onPress={() => issueRefund(true)} disabled={refundLoading}>
                    {refundLoading ? <ActivityIndicator color={C.greenDark}/> : <Text style={[s.btnTxt, { color: C.greenDark }]}>💸 Prorated Refund (Recommended)</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.btn, { backgroundColor: "#ff1a1a15", borderWidth: 1, borderColor: "#ff5a5a40" }]} onPress={() => issueRefund(false)} disabled={refundLoading}>
                    <Text style={[s.btnTxt, { color: C.red }]}>Full Refund</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[s.body, { marginTop: 12, color: C.text4, fontSize: 11, lineHeight: 16 }]}>
                  Both options cancel the subscription and downgrade to free.{"\n"}
                  Prorated = refund for unused days. Full = entire amount.
                </Text>
              </>
            )}
          </>
        )}

        {/* ── ACCESS TAB ── */}
        {tab === "access" && (
          <>
            <Text style={s.sectionLbl}>SUPER ADMINS</Text>
            {["NVisionsinc@gmail.com","Natev9@comcast.net","NathanRussell9@outlook.com"].map(e => (
              <View key={e} style={[s.row, { backgroundColor: "#0a1500" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.green, fontWeight: "700", fontSize: 12 }} numberOfLines={1} adjustsFontSizeToFit>⭐ {e}</Text>
                  <Text style={{ color: C.text4, fontSize: 10, marginTop: 2 }}>Permanent Super Admin</Text>
                </View>
              </View>
            ))}

            <Text style={[s.sectionLbl, { marginTop: 20 }]}>GRANT / REVOKE ACCESS</Text>
            <Text style={[s.body, { marginBottom: 14 }]}>Grant or revoke admin access for any user by email.</Text>
            <TextInput
              style={[s.searchInput, { marginBottom: 10 }]}
              placeholder="User email..."
              placeholderTextColor={C.text4}
              value={grantEmail}
              onChangeText={setGrantEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.green }]} onPress={async () => {
                try {
                  const r = await fetch(`${API_BASE}/api/admin/grant-access`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token, targetEmail: grantEmail.trim(), grant: true }),
                  });
                  const d = await r.json();
                  Alert.alert(d.success ? "✅ Done" : "Error", d.message || d.error);
                  if (d.success) setGrantEmail("");
                } catch { Alert.alert("Error", "Network error"); }
              }}>
                <Text style={[s.btnTxt, { color: C.greenDark }]}>✅ Grant</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: "#ff1a1a15", borderWidth: 1, borderColor: "#ff5a5a40" }]} onPress={async () => {
                try {
                  const r = await fetch(`${API_BASE}/api/admin/grant-access`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token, targetEmail: grantEmail.trim(), grant: false }),
                  });
                  const d = await r.json();
                  Alert.alert(d.success ? "✅ Done" : "Error", d.message || d.error);
                } catch { Alert.alert("Error", "Network error"); }
              }}>
                <Text style={[s.btnTxt, { color: C.red }]}>❌ Revoke</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Plan change modal */}
      <Modal visible={planModal} transparent animationType="slide" onRequestClose={() => setPlanModal(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setPlanModal(false)}>
          <View style={s.sheet}>
            <Text style={s.h2}>Change Plan</Text>
            <Text style={[s.body, { marginBottom: 16 }]} numberOfLines={1}>{selectedUser?.email}</Text>
            {PLANS.map(p => (
              <TouchableOpacity key={p} style={[s.planBtn, selectedUser?.plan === p && s.planBtnActive]}
                onPress={() => changePlan(selectedUser?.id, p)}>
                <Text style={{ color: selectedUser?.plan === p ? C.green : C.text1, fontWeight: "700", textTransform: "capitalize", fontSize: 15 }}>
                  {selectedUser?.plan === p ? "✓ " : ""}{p}
                </Text>
                <Text style={{ color: C.text4, fontSize: 12 }}>
                  {p === "free" ? "Free" : p === "seller" ? "$14.99/mo" : p === "pro" ? "$34.99/mo" : p === "lifetime" ? "$149 once" : "$79/mo"}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setPlanModal(false)} style={{ marginTop: 16, alignItems: "center", padding: 12 }}>
              <Text style={{ color: C.text3, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:      { padding: 6, marginRight: 4 },
  backTxt:      { color: C.text3, fontSize: 28, lineHeight: 30 },
  headerTitle:  { flex: 1, color: C.text1, fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  refreshBtn:   { padding: 6 },
  refreshTxt:   { color: C.text3, fontSize: 22 },
  tabs:         { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn:       { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  tabActive:    { borderBottomWidth: 2, borderBottomColor: C.green },
  tabIcon:      { fontSize: 16 },
  tabLbl:       { color: C.text4, fontSize: 9, fontWeight: "700", marginTop: 2 },
  tabLblActive: { color: C.green },
  sectionLbl:   { color: C.text4, fontSize: 9, fontWeight: "800", letterSpacing: 1.5, marginBottom: 10, textTransform: "uppercase" },
  grid:         { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  metricCard:   { width: "31%", backgroundColor: C.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border },
  metricVal:    { fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  metricLbl:    { color: C.text4, fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginTop: 3 },
  metricDetail: { color: C.text3, fontSize: 11, marginTop: 8, lineHeight: 16, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 },
  row:          { backgroundColor: C.surface, borderRadius: 10, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6, borderWidth: 1, borderColor: C.border },
  searchRow:    { flexDirection: "row", gap: 8, marginBottom: 10 },
  searchInput:  { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, color: C.text1, fontSize: 14 },
  searchBtn:    { backgroundColor: C.green, borderRadius: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  userCard:     { backgroundColor: C.surface, borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.border },
  userEmail:    { color: C.text1, fontSize: 13, fontWeight: "700" },
  planBadge:    { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  actionBtn:    { backgroundColor: C.greenBg, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: C.greenBorder, minWidth: 58, alignItems: "center" },
  actionBtnTxt: { color: C.green, fontSize: 11, fontWeight: "700" },
  selectedCard: { backgroundColor: "#0a1500", borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.greenBorder },
  btn:          { backgroundColor: C.surface, borderRadius: 12, padding: 14, alignItems: "center" },
  btnTxt:       { fontSize: 15, fontWeight: "900", color: C.text1 },
  h2:           { color: C.text1, fontSize: 20, fontWeight: "900", marginBottom: 4 },
  body:         { color: C.text3, fontSize: 13, lineHeight: 20 },
  overlay:      { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet:        { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  planBtn:      { backgroundColor: C.surface, borderRadius: 10, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6, borderWidth: 1, borderColor: C.border },
  planBtnActive:{ borderColor: C.green, backgroundColor: C.greenBg },
  greenBg:      { backgroundColor: C.greenBg },
  greenBorder:  { borderColor: C.greenBorder },
});
