import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,

  useWindowDimensions,
} from "react-native";
import { CustomIcon } from "../../components/ui/CustomIcon";
import { SafeAreaView } from "react-native-safe-area-context";

import { WebView } from "react-native-webview";
import { GameStorage } from "./GameStorage";
import type { StoredGame } from "./GameStorage";
import { UserService, LocalUserProfile } from "../services/UserService";
import SimpleGameService from "../services/SimpleGameService";
import { getGameErrorMonitoringScript } from "./WebViewUtils";
import type { SimpleGame } from "../services/SimpleGameService";
import { useAuth } from "../auth/AuthProvider";

type ProfileTab = "created" | "liked";

const Profile = React.forwardRef<{ refresh: () => void }, { 
  onClose: () => void;
  onPlayGame?: (game: any) => void;
  onCreateGame?: () => void;
}>(({ onClose, onPlayGame, onCreateGame }, ref) => {
  const { user, signOutFirebase } = useAuth();
  const { width, height } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<ProfileTab>("created");
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState<LocalUserProfile | null>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("🎮");
  const [createdGames, setCreatedGames] = useState<SimpleGame[]>([]);
  const [likedGames, setLikedGames] = useState<StoredGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<SimpleGame | null>(null);
  const [showGamePreview, setShowGamePreview] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const avatarOptions = ["🎮", "👾", "🎯", "🚀", "⚡", "🎨", "🎭", "🦸", "🤖", "👻", "🦊", "🐉"];
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) > 600;

  useEffect(() => {
    loadProfileData();
  }, []);

  // Refresh profile data when user changes (e.g., after sign in/out)
  useEffect(() => {
    if (user) {
      console.log('👤 User changed, refreshing profile data...');
      loadProfileData();
    }
  }, [user]);

  // Add a manual refresh function that can be called from parent components
  const refreshProfile = () => {
    console.log('🔄 Manually refreshing profile data...');
    loadProfileData();
  };

  // Expose refresh function to parent component
  React.useImperativeHandle(ref, () => ({
    refresh: refreshProfile
  }), []);

  const loadProfileData = async () => {
    setIsLoading(true);
    try {
      const userService = UserService.getInstance();
      let userProfile = null;
      
      if (user) {
        // Force sync from Firebase first to ensure we have the latest data
        console.log('🔄 Syncing profile from Firebase before loading...');
        await userService.syncProfileFromFirebase(user);
        userProfile = await userService.getCombinedProfile(user);
      } else {
        userProfile = await GameStorage.getUserProfile();
      }

      if (userProfile) {
        console.log('📋 Setting profile data:', userProfile);
        setProfile(userProfile);
        setName(userProfile.name);
        setBio(userProfile.bio);
        setAvatar(userProfile.avatar);
      } else {
        console.log('⚠️ No profile data found, using defaults');
        // Set defaults if no profile found
        const defaultName = user?.displayName || user?.email?.split('@')[0] || 'Player';
        setName(defaultName);
        setBio('Creating awesome games');
        setAvatar('🎮');
      }

      if (user) {
        const gameService = SimpleGameService.getInstance();
        const [created, liked] = await Promise.all([
          gameService.getUserCreatedGames(user.uid),
          userService.getUserLikedGames(user)
        ]);
        setCreatedGames(created);
        setLikedGames(liked);
      } else {
        setLikedGames(await GameStorage.getLikedGames());
      }
    } catch (error) {
      console.error('Failed to load profile data:', error);
      // Set fallback data if there's an error
      if (user) {
        const defaultName = user.displayName || user.email?.split('@')[0] || 'Player';
        setName(defaultName);
        setBio('Creating awesome games');
        setAvatar('🎮');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      const profileData = { name: name.trim() || "Player", bio: bio.trim(), avatar };
      const updated = user 
        ? await UserService.getInstance().updateUserProfile(user, profileData)
        : await GameStorage.updateUserProfile(profileData);
      setProfile(updated);
      setIsEditing(false);
    } catch (error) {
      Alert.alert("Error", "Failed to update profile");
    }
  };

  const handleDeleteGame = (gameId: string) => {
    Alert.alert("Delete Game", "Are you sure? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await GameStorage.deleteGame(gameId);
          await loadProfileData();
        } catch (error) {
          Alert.alert("Error", "Failed to delete game");
        }
      }}
    ]);
  };

  const handlePlayGame = (game: SimpleGame) => {
    if (onPlayGame) {
      onPlayGame({
        id: game.id, title: game.title, author: game.author, likes: game.likes,
        liked: game.liked || false, html: game.html || "", duration: game.duration || 60,
        category: game.category, views: game.views, comments: game.commentCount || 0,
      });
      onClose();
    } else {
      setSelectedGame(game);
      setShowGamePreview(true);
    }
  };

  const formatNumber = (num: number) => 
    num >= 1000000 ? `${(num / 1000000).toFixed(1)}M` :
    num >= 1000 ? `${(num / 1000).toFixed(1)}K` : String(num);

  const renderGame = ({ item }: { item: SimpleGame | StoredGame }) => {
    const comments = 'commentCount' in item ? item.commentCount || 0 : 'comments' in item ? item.comments : 0;
    
    return (
      <Pressable style={styles.gameCard} onPress={() => handlePlayGame(item as SimpleGame)}>
        <View style={styles.gameThumbnail}>
          <WebView
            source={{ html: item.html || "" }}
            style={{ flex: 1 }}
            scrollEnabled={false}
            pointerEvents="none"
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            injectedJavaScript={`${getGameErrorMonitoringScript()}; true;`}
            onMessage={(event) => {
              try {
                const data = JSON.parse(event.nativeEvent.data);
                if (data.type === 'error' || data.type === 'console.error' || data.type === 'runtime-error' || data.type === 'syntax-error' || data.type === 'network-error') {
                  console.error('ERROR IN GENERATED CODE: Profile thumbnail error:', data.message, 'Game ID:', item.id);
                } else if (data.type === 'console.warn') {
                  console.warn('ERROR IN GENERATED CODE: Profile thumbnail warning:', data.message, 'Game ID:', item.id);
                }
              } catch {}
            }}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error('ERROR IN GENERATED CODE: Profile thumbnail WebView load error:', nativeEvent, 'Game ID:', item.id);
            }}
          />
          <View style={styles.gameOverlay}>
            <View style={styles.gameStats}>
              <View style={styles.statItem}>
                <CustomIcon name="heart" size={14} color="#fff" />
                <Text style={styles.statText}>{formatNumber(item.likes)}</Text>
              </View>
              <View style={styles.statItem}>
                <CustomIcon name="chatbubble" size={14} color="#fff" />
                <Text style={styles.statText}>{formatNumber(comments)}</Text>
              </View>
            </View>
          </View>
        </View>
        <Text style={styles.gameTitle} numberOfLines={1}>{item.title}</Text>
        {activeTab === "created" && (
          <Pressable style={styles.deleteBtn} onPress={() => handleDeleteGame(item.id)}>
            <CustomIcon name="trash-outline" size={16} color="#ef4444" />
          </Pressable>
        )}
      </Pressable>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#7C4DFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { width, height }]} edges={["top"]}>
      <View style={[styles.header, { width }]}>
        <Pressable onPress={onClose} style={styles.backBtn}>
          <CustomIcon name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => onCreateGame?.()} style={styles.createGameHeaderBtn}>
            <CustomIcon name="add-circle" size={20} color="#7C4DFF" />
            <Text style={styles.createGameHeaderText}>Create</Text>
          </Pressable>
          <Pressable onPress={() => isEditing ? handleSaveProfile() : setIsEditing(true)} style={styles.editBtn}>
            <Text style={styles.editText}>{isEditing ? "Save" : "Edit"}</Text>
          </Pressable>
          <Pressable onPress={() => Alert.alert(
            "Sign Out", 
            "Are you sure you want to sign out? You'll be returned to the login screen.", 
            [
              { text: "Cancel", style: "cancel" },
              { text: "Sign Out", style: "destructive", onPress: async () => {
                try {
                  setIsSigningOut(true);
                  console.log('🚪 User initiated sign out...');
                  await signOutFirebase();
                  console.log('✅ Sign out successful, closing profile...');
                  onClose();
                } catch (error) {
                  console.error('❌ Sign out error:', error);
                  Alert.alert("Error", "Failed to sign out. Please try again.");
                } finally {
                  setIsSigningOut(false);
                }
              }}
            ]
          )} style={[styles.signOutBtn, isSigningOut && styles.signOutBtnDisabled]}>
            {isSigningOut ? (
              <ActivityIndicator size={20} color="#EF4444" />
            ) : (
              <CustomIcon name="log-out-outline" size={20} color="#EF4444" />
            )}
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollView}>
        {/* Profile Info */}
        <View style={styles.profileSection}>
          {isEditing ? (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.avatarSelector}
              contentContainerStyle={styles.avatarSelectorContent}
            >
              {avatarOptions.map((emoji) => (
                <Pressable
                  key={emoji}
                  style={[
                    styles.avatarOption,
                    avatar === emoji && styles.avatarOptionSelected
                  ]}
                  onPress={() => setAvatar(emoji)}
                >
                  <Text style={styles.avatarOptionText}>{emoji}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{avatar}</Text>
            </View>
          )}
          
          {isEditing ? (
            <>
              <TextInput
                value={name}
                onChangeText={setName}
                style={styles.nameInput}
                placeholder="Your name"
                placeholderTextColor="#6B7280"
                maxLength={20}
              />
              <TextInput
                value={bio}
                onChangeText={setBio}
                style={styles.bioInput}
                placeholder="Tell us about yourself..."
                placeholderTextColor="#6B7280"
                multiline
                maxLength={100}
              />
            </>
          ) : (
            <>
              <Text style={styles.profileName}>{name || "Player"}</Text>
              <Text style={styles.profileBio}>{bio || "Creating awesome games"}</Text>
            </>
          )}

          <View style={styles.stats}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{createdGames.length}</Text>
              <Text style={styles.statLabel}>Created</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{likedGames.length}</Text>
              <Text style={styles.statLabel}>Saved</Text>
            </View>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, activeTab === "created" && styles.tabActive]}
            onPress={() => setActiveTab("created")}
          >
            <Text style={[styles.tabText, activeTab === "created" && styles.tabTextActive]}>
              Created ({createdGames.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === "liked" && styles.tabActive]}
            onPress={() => setActiveTab("liked")}
          >
            <Text style={[styles.tabText, activeTab === "liked" && styles.tabTextActive]}>
              Liked ({likedGames.length})
            </Text>
          </Pressable>
          <Pressable
            style={styles.createTabBtn}
            onPress={() => onCreateGame?.()}
          >
            <CustomIcon name="add-circle" size={16} color="#7C4DFF" />
            <Text style={styles.createTabText}>Create</Text>
          </Pressable>
        </View>

        <View style={styles.gamesContainer}>
          {activeTab === "created" ? (
            createdGames.length === 0 ? (
              <View style={styles.emptyState}>
                <CustomIcon name="game-controller-outline" size={48} color="#6B7280" />
                <Text style={styles.emptyText}>No games created yet</Text>
                <Text style={styles.emptySubtext}>Start creating amazing games!</Text>
                <Pressable style={styles.createGameBtn} onPress={() => onCreateGame?.()}>
                  <CustomIcon name="add-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.createGameText}>Create Your First Game</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.createMoreSection}>
                  <Pressable style={styles.createMoreBtn} onPress={() => onCreateGame?.()}>
                    <CustomIcon name="add" size={20} color="#7C4DFF" />
                    <Text style={styles.createMoreText}>Create Another Game</Text>
                  </Pressable>
                </View>
                <FlatList
                  data={createdGames}
                  renderItem={renderGame}
                  keyExtractor={(item) => item.id}
                  numColumns={isTablet ? 3 : 2}
                  columnWrapperStyle={styles.gameRow}
                  scrollEnabled={false}
                  contentContainerStyle={styles.gamesGrid}
                />
              </>
            )
          ) : (
            likedGames.length === 0 ? (
              <View style={styles.emptyState}>
                <CustomIcon name="heart-outline" size={48} color="#6B7280" />
                <Text style={styles.emptyText}>No liked games yet</Text>
                <Text style={styles.emptySubtext}>Explore and like games you enjoy!</Text>
              </View>
            ) : (
              <FlatList
                data={likedGames}
                renderItem={renderGame}
                keyExtractor={(item) => item.id}
                numColumns={isTablet ? 3 : 2}
                columnWrapperStyle={styles.gameRow}
                scrollEnabled={false}
                contentContainerStyle={styles.gamesGrid}
              />
            )
          )}
        </View>
      </ScrollView>

      {/* Game Preview Modal */}
      <Modal visible={showGamePreview} animationType="slide">
        <SafeAreaView style={styles.previewContainer}>
          <View style={styles.previewHeader}>
            <Pressable onPress={() => setShowGamePreview(false)} style={styles.backBtn}>
              <CustomIcon name="arrow-back" size={24} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.previewTitle}>{selectedGame?.title}</Text>
            <View style={{ width: 48 }} />
          </View>
          {selectedGame && (
            <WebView
              source={{ html: selectedGame.html || "" }}
              style={styles.previewWebview}
              javaScriptEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              originWhitelist={["*"]}
              injectedJavaScript={`${getGameErrorMonitoringScript()}; true;`}
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  if (data.type === 'error' || data.type === 'console.error' || data.type === 'runtime-error' || data.type === 'syntax-error' || data.type === 'network-error') {
                    console.error('ERROR IN GENERATED CODE: Profile preview error:', data.message, 'Game ID:', selectedGame.id);
                  } else if (data.type === 'console.warn') {
                    console.warn('ERROR IN GENERATED CODE: Profile preview warning:', data.message, 'Game ID:', selectedGame.id);
                  }
                } catch {}
              }}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error('ERROR IN GENERATED CODE: Profile preview WebView load error:', nativeEvent, 'Game ID:', selectedGame.id);
              }}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0A0F" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 1000,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12, paddingTop: 0,
    borderBottomWidth: 1, borderBottomColor: "#1A1A1A", backgroundColor: "#0B0A0F"
  },
  scrollView: { marginTop: 60 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -12 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#FFFFFF" },
  editBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  editText: { color: "#7C4DFF", fontSize: 14, fontWeight: "600" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  createGameHeaderBtn: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 6, 
    paddingHorizontal: 12, 
    paddingVertical: 8,
    backgroundColor: "rgba(124, 77, 255, 0.1)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(124, 77, 255, 0.3)"
  },
  createGameHeaderText: { color: "#7C4DFF", fontSize: 14, fontWeight: "600" },
  signOutBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  signOutBtnDisabled: { opacity: 0.6 },
  profileSection: { alignItems: "center", paddingVertical: 24, paddingHorizontal: 16 },
  avatar: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: "#121219",
    alignItems: "center", justifyContent: "center", marginBottom: 16,
    borderWidth: 3, borderColor: "#7C4DFF"
  },
  avatarText: { fontSize: 44 },
  avatarSelector: { height: 88, marginBottom: 16, maxHeight: 88 },
  avatarSelectorContent: { paddingHorizontal: 20, gap: 12 },
  avatarOption: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "#121219",
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent"
  },
  avatarOptionSelected: { borderColor: "#7C4DFF" },
  avatarOptionText: { fontSize: 32 },
  profileName: { fontSize: 24, fontWeight: "700", color: "#FFFFFF", marginBottom: 4 },
  profileBio: {
    fontSize: 14, color: "#B7B9C0", textAlign: "center", marginBottom: 24,
    paddingHorizontal: 32, lineHeight: 20
  },
  nameInput: {
    fontSize: 20, fontWeight: "700", color: "#FFFFFF", backgroundColor: "#121219",
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 12,
    width: "100%", textAlign: "center", borderWidth: 1, borderColor: "#2A2B33"
  },
  bioInput: {
    fontSize: 14, color: "#FFFFFF", backgroundColor: "#121219", borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 10, marginBottom: 24, width: "100%",
    textAlign: "center", minHeight: 80, borderWidth: 1, borderColor: "#2A2B33"
  },
  stats: {
    flexDirection: "row", alignItems: "center", gap: 24, backgroundColor: "#121219",
    paddingVertical: 16, paddingHorizontal: 24, borderRadius: 16
  },
  statBox: { alignItems: "center", minWidth: 60 },
  statValue: { fontSize: 20, fontWeight: "700", color: "#FFFFFF" },
  statLabel: {
    fontSize: 11, color: "#6B7280", marginTop: 2,
    textTransform: "uppercase", letterSpacing: 0.5
  },
  statDivider: { width: 1, height: 32, backgroundColor: "#2A2B33" },
  tabs: {
    flexDirection: "row", paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: "#1A1A1A",
    alignItems: "center"
  },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#7C4DFF" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  tabTextActive: { color: "#FFFFFF" },
  createTabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(124, 77, 255, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(124, 77, 255, 0.3)"
  },
  createTabText: { color: "#7C4DFF", fontSize: 12, fontWeight: "600" },
  createMoreSection: { 
    alignItems: "center", 
    paddingVertical: 20, 
    paddingHorizontal: 16 
  },
  createMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "rgba(124, 77, 255, 0.1)",
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "rgba(124, 77, 255, 0.3)"
  },
  createMoreText: { color: "#7C4DFF", fontSize: 14, fontWeight: "600" },
  gamesContainer: { minHeight: 200 },
  gamesGrid: { padding: 16 },
  gameRow: { justifyContent: "space-between", marginBottom: 16 },
  gameCard: { width: "48%", position: "relative" },
  gameThumbnail: {
    width: "100%", aspectRatio: 1, borderRadius: 14,
    overflow: "hidden", backgroundColor: "#121219"
  },
  gameOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0, padding: 8,
    backgroundColor: "rgba(0,0,0,0.7)", borderBottomLeftRadius: 14, borderBottomRightRadius: 14
  },
  gameStats: { flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  statItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { color: "#FFFFFF", fontSize: 11, fontWeight: "600" },
  gameTitle: {
    color: "#FFFFFF", fontSize: 13, fontWeight: "600",
    marginTop: 8, paddingHorizontal: 2
  },
  deleteBtn: {
    position: "absolute", top: 8, right: 8, width: 28, height: 28,
    borderRadius: 14, backgroundColor: "rgba(0,0,0,0.8)",
    alignItems: "center", justifyContent: "center"
  },
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600", marginTop: 16 },
  emptySubtext: { color: "#6B7280", fontSize: 14, marginTop: 4 },
  createGameBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20,
    backgroundColor: "#7C4DFF", paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 25, shadowColor: "#7C4DFF", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8
  },
  createGameText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  previewContainer: { flex: 1, backgroundColor: "#0B0A0F" },
  previewHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12, paddingTop: 0,
    borderBottomWidth: 1, borderBottomColor: "#1A1A1A"
  },
  previewTitle: {
    fontSize: 16, fontWeight: "600", color: "#FFFFFF",
    flex: 1, textAlign: "center"
  },
  previewWebview: { flex: 1, backgroundColor: "#0B0A0F" }
});

export default Profile;