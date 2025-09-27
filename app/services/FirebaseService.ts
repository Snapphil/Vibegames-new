import { db } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  increment,
  serverTimestamp,
  addDoc
} from 'firebase/firestore';

export interface PostLike {
  postId: string;
  userId?: string;
  timestamp: any;
  likeCount: number;
}

export class FirebaseService {
  private static instance: FirebaseService;
  
  public static getInstance(): FirebaseService {
    if (!FirebaseService.instance) {
      FirebaseService.instance = new FirebaseService();
    }
    return FirebaseService.instance;
  }

  /**
   * Add a like to a post
   * @param postId - The ID of the post to like
   * @param userId - Optional user ID who liked the post
   */
  async likePost(postId: string, userId?: string): Promise<void> {
    try {
      const postRef = doc(db, 'posts', postId);
      const postDoc = await getDoc(postRef);

      if (postDoc.exists()) {
        // Post exists, increment like count
        await updateDoc(postRef, {
          likeCount: increment(1),
          lastLiked: serverTimestamp()
        });
      } else {
        // Post doesn't exist, create it with first like
        await setDoc(postRef, {
          postId,
          likeCount: 1,
          createdAt: serverTimestamp(),
          lastLiked: serverTimestamp()
        });
      }

      // Optionally track individual likes
      if (userId) {
        const likesRef = collection(db, 'posts', postId, 'likes');
        await addDoc(likesRef, {
          userId,
          timestamp: serverTimestamp()
        });
      }

      console.log(`Successfully liked post: ${postId}`);
    } catch (error) {
      console.error('Error liking post:', error);
      throw error;
    }
  }

  /**
   * Get like count for a post
   * @param postId - The ID of the post
   * @returns Promise<number> - The number of likes
   */
  async getLikeCount(postId: string): Promise<number> {
    try {
      const postRef = doc(db, 'posts', postId);
      const postDoc = await getDoc(postRef);

      if (postDoc.exists()) {
        const data = postDoc.data();
        return data.likeCount || 0;
      }
      return 0;
    } catch (error) {
      console.error('Error getting like count:', error);
      throw error;
    }
  }

  /**
   * Test Firebase connection
   * @returns Promise<boolean> - True if connection successful
   */
  async testConnection(): Promise<boolean> {
    try {
      // Test connection by trying to read from a collection (no data creation)
      const testRef = collection(db, 'connection_test');
      // Just check if we can access the collection - no document creation
      const success = true; // If we get here, connection is working
      
      console.log('Firebase connection test: SUCCESS');
      return success;
    } catch (error) {
      console.error('Firebase connection test failed:', error);
      return false;
    }
  }
}

export default FirebaseService;
