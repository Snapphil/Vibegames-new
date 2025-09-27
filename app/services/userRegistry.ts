import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';

function toHandle(user: User) {
  // Extract username from email (first part before @)
  if (user.email && user.email.includes('@')) {
    const emailUsername = user.email.split('@')[0];
    const cleanUsername = emailUsername.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (cleanUsername.length > 0) {
      return `@${cleanUsername}`;
    }
  }
  
  // Fallback to displayName or UID
  const base = (user.displayName || user.uid)
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase() || user.uid.slice(0, 10);
  return `@${base}`;
}

function getUsernameFromHandle(handle: string): string {
  // Remove @ prefix if present
  return handle.startsWith('@') ? handle.slice(1) : handle;
}

export async function ensureUserDocument(user: User) {
  try {
    const userHandle = toHandle(user);
    const username = getUsernameFromHandle(userHandle);
    
    // Use username as document ID instead of Firebase UID
    const userRef = doc(db, 'users', username);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      console.log(`🆕 Creating new user document for ${user.email} with username: ${username}`);
      
      await setDoc(userRef, {
        uid: user.uid, // Store Firebase UID for reference
        displayName: user.displayName || user.email?.split('@')[0] || 'Player',
        bio: 'Creating awesome games',
        avatar: '🎮',
        handle: userHandle,
        email: user.email ?? null,
        photoURL: user.photoURL ?? null,
        totals: { totalLikes: 0, totalViews: 0, totalGames: 0 },
        likedGames: [], // Array of game IDs that user has liked
        createdGames: [], // Array of game IDs that user has created
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
      
      console.log(`✅ User document created successfully for ${user.email} with username: ${username}`);
    } else {
      // Update existing user document
      const updateData: any = {
        uid: user.uid, // Always update UID in case it changed
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      };
      
      // Update other fields if they changed
      const existingData = userSnap.data();
      const newHandle = toHandle(user);
      if (existingData.handle !== newHandle) {
        updateData.handle = newHandle;
        updateData.displayName = user.displayName || user.email?.split('@')[0] || existingData.displayName;
        console.log(`🔄 Updating user handle from ${existingData.handle} to ${updateData.handle}`);
      }
      
      await updateDoc(userRef, updateData);
      console.log(`✅ User document updated for ${user.email}`);
    }
  } catch (error) {
    console.error('❌ Error ensuring user document:', error);
    throw error;
  }
}

// Add default export for Expo Router
export default {
  ensureUserDocument,
  toHandle,
  getUsernameFromHandle
};
