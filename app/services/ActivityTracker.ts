import { SessionService } from './SessionService';

class ActivityTracker {
  private static instance: ActivityTracker;
  private activityTimer: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();
  
  public static getInstance(): ActivityTracker {
    if (!ActivityTracker.instance) {
      ActivityTracker.instance = new ActivityTracker();
    }
    return ActivityTracker.instance;
  }

  /**
   * Start tracking user activity
   */
  startTracking(): void {
    this.updateActivity();
    
    // Update activity every 30 seconds
    this.activityTimer = setInterval(() => {
      this.updateActivity();
    }, 30000);
    
    console.log('✅ Activity tracking started');
  }

  /**
   * Stop tracking user activity
   */
  stopTracking(): void {
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
    console.log('✅ Activity tracking stopped');
  }

  /**
   * Record user activity (called on interactions)
   */
  recordActivity(): void {
    this.lastActivity = Date.now();
    this.updateActivity();
  }

  /**
   * Update session activity in background
   */
  private updateActivity(): void {
    SessionService.updateActivity().catch(error => {
      console.error('Error updating session activity:', error);
    });
  }
}

export const ActivityTrackerInstance = ActivityTracker.getInstance();
export default ActivityTrackerInstance;
