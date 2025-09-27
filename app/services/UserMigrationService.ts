/**
 * React Native compatible user migration service
 * Migrates users from Firebase UID-based to username-based document IDs
 */

import { db } from './firebase';
import { collection, getDocs, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

export class UserMigrationService {
  private static instance: UserMigrationService;

  public static getInstance(): UserMigrationService {
    if (!UserMigrationService.instance) {
      UserMigrationService.instance = new UserMigrationService();
    }
    return UserMigrationService.instance;
  }

  private getUsernameFromHandle(handle: string): string {
    return handle.startsWith('@') ? handle.slice(1) : handle;
  }

  private isFirebaseUID(str: string): boolean {
    // Firebase UIDs are typically 28 characters long and contain alphanumeric characters
    return str && str.length === 28 && /^[a-zA-Z0-9]+$/.test(str);
  }

  /**
   * Check migration status
   */
  async checkMigrationStatus(): Promise<{
    needsMigration: number;
    alreadyMigrated: number;
    total: number;
    migrationsNeeded: {oldDocId: string, newDocId: string, userData: any}[]
  }> {
    console.log('🔍 Checking user migration status...');
    
    try {
      const usersRef = collection(db, 'users');
      const querySnapshot = await getDocs(usersRef);
      
      const migrationsNeeded: {oldDocId: string, newDocId: string, userData: any}[] = [];
      const alreadyMigrated: string[] = [];
      
      querySnapshot.forEach((docSnap) => {
        const docId = docSnap.id;
        const userData = docSnap.data();
        
        if (this.isFirebaseUID(docId)) {
          // This is an old UID-based document that needs migration
          if (userData.handle) {
            const username = this.getUsernameFromHandle(userData.handle);
            migrationsNeeded.push({
              oldDocId: docId,
              newDocId: username,
              userData: userData
            });
          } else {
            console.warn(`⚠️ User document ${docId} has no handle, skipping migration`);
          }
        } else {
          // This is already a username-based document
          alreadyMigrated.push(docId);
        }
      });
      
      const status = {
        needsMigration: migrationsNeeded.length,
        alreadyMigrated: alreadyMigrated.length,
        total: querySnapshot.size,
        migrationsNeeded
      };
      
      console.log('📊 Migration Status:', {
        needsMigration: status.needsMigration,
        alreadyMigrated: status.alreadyMigrated,
        total: status.total
      });
      
      return status;
    } catch (error) {
      console.error('❌ Error checking migration status:', error);
      throw error;
    }
  }

  /**
   * Migrate a single user from UID-based to username-based document
   */
  async migrateSingleUser(oldDocId: string, newDocId: string, userData: any): Promise<boolean> {
    try {
      // Check if target document already exists
      const newDocRef = doc(db, 'users', newDocId);
      const existingDoc = await getDoc(newDocRef);
      
      if (existingDoc.exists()) {
        console.log(`⚠️ Target document ${newDocId} already exists, skipping`);
        return false;
      }
      
      // Create new document with username as ID
      const newUserData = {
        ...userData,
        uid: oldDocId, // Store the original Firebase UID for reference
        migratedAt: serverTimestamp(),
      };
      
      await setDoc(newDocRef, newUserData);
      console.log(`✅ Successfully migrated ${oldDocId} → ${newDocId}`);
      return true;
      
    } catch (error) {
      console.error(`❌ Error migrating ${oldDocId} → ${newDocId}:`, error);
      return false;
    }
  }

  /**
   * Migrate all users that need migration
   */
  async migrateAllUsers(): Promise<{
    successful: number;
    failed: number;
    skipped: number;
  }> {
    console.log('🚀 Starting full user migration...');
    
    try {
      const status = await this.checkMigrationStatus();
      
      if (status.needsMigration === 0) {
        console.log('✅ No migration needed - all users already use username-based document IDs');
        return { successful: 0, failed: 0, skipped: 0 };
      }
      
      let successful = 0;
      let failed = 0;
      let skipped = 0;
      
      for (const migration of status.migrationsNeeded) {
        console.log(`🔄 Migrating ${migration.oldDocId} → ${migration.newDocId}`);
        
        const result = await this.migrateSingleUser(
          migration.oldDocId,
          migration.newDocId,
          migration.userData
        );
        
        if (result === true) {
          successful++;
        } else if (result === false) {
          skipped++;
        } else {
          failed++;
        }
        
        // Add a small delay to avoid overwhelming Firestore
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      const results = { successful, failed, skipped };
      
      console.log('✅ Migration completed!', results);
      console.log('📝 Next steps:');
      console.log('  1. Test the application with the new username-based user documents');
      console.log('  2. Verify that user interactions (likes, views) are working correctly');
      console.log('  3. Once confirmed working, you can manually delete old UID-based documents');
      
      return results;
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Get user by username (new format)
   */
  async getUserByUsername(username: string): Promise<any | null> {
    try {
      const cleanUsername = username.startsWith('@') ? username.slice(1) : username;
      const userRef = doc(db, 'users', cleanUsername);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        return { id: userDoc.id, ...userDoc.data() };
      }
      return null;
    } catch (error) {
      console.error('Error getting user by username:', error);
      return null;
    }
  }

  /**
   * Get user by Firebase UID (old format, for backward compatibility)
   */
  async getUserByUID(uid: string): Promise<any | null> {
    try {
      const userRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        return { id: userDoc.id, ...userDoc.data() };
      }
      return null;
    } catch (error) {
      console.error('Error getting user by UID:', error);
      return null;
    }
  }
}

// Add default export for Expo Router
export default UserMigrationService;
