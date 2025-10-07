import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OnboardingServiceInstance from '../services/OnboardingService';
import type { OnboardingProgress } from '../services/OnboardingService';

/**
 * Debug component for testing onboarding functionality
 * Add this to your Profile screen or any other screen for testing
 * 
 * Usage:
 * import OnboardingDebug from './components/OnboardingDebug';
 * 
 * <OnboardingDebug />
 */
export default function OnboardingDebug() {
  const [status, setStatus] = useState<'completed' | 'pending' | 'unknown'>('unknown');
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkStatus();

    // Subscribe to updates
    const unsubscribe = OnboardingServiceInstance.subscribe((newProgress) => {
      setProgress(newProgress);
      setStatus(newProgress.completed ? 'completed' : 'pending');
    });

    return unsubscribe;
  }, []);

  const checkStatus = async () => {
    setIsLoading(true);
    try {
      const completed = await OnboardingServiceInstance.hasCompletedOnboarding();
      const currentProgress = await OnboardingServiceInstance.getProgress();
      
      setStatus(completed ? 'completed' : 'pending');
      setProgress(currentProgress);
    } catch (error) {
      console.error('Error checking onboarding status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    setIsLoading(true);
    try {
      await OnboardingServiceInstance.resetOnboarding();
      await checkStatus();
      alert('Onboarding reset! Close and reopen the app to see the tutorial again.');
    } catch (error) {
      console.error('Error resetting onboarding:', error);
      alert('Error resetting onboarding. Check console for details.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      await OnboardingServiceInstance.markOnboardingCompleted(false);
      await checkStatus();
      alert('Onboarding marked as completed!');
    } catch (error) {
      console.error('Error completing onboarding:', error);
      alert('Error completing onboarding. Check console for details.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="bug" size={20} color="#FF3040" />
        <Text style={styles.title}>Onboarding Debug</Text>
      </View>

      <View style={styles.statusContainer}>
        <Text style={styles.label}>Status:</Text>
        <View style={[
          styles.statusBadge,
          status === 'completed' && styles.statusCompleted,
          status === 'pending' && styles.statusPending,
        ]}>
          <Text style={styles.statusText}>
            {status === 'completed' ? '✓ Completed' : status === 'pending' ? '○ Pending' : '? Unknown'}
          </Text>
        </View>
      </View>

      {progress && (
        <View style={styles.progressContainer}>
          <Text style={styles.progressLabel}>Progress:</Text>
          <Text style={styles.progressText}>
            Step {progress.currentStep + 1} of {progress.totalSteps}
          </Text>
          {progress.skipped && (
            <Text style={styles.skippedText}>(Skipped)</Text>
          )}
        </View>
      )}

      <View style={styles.buttonContainer}>
        <Pressable
          style={[styles.button, styles.buttonReset, isLoading && styles.buttonDisabled]}
          onPress={handleReset}
          disabled={isLoading}
        >
          <Ionicons name="refresh" size={16} color="#FFFFFF" />
          <Text style={styles.buttonText}>Reset Onboarding</Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.buttonComplete, isLoading && styles.buttonDisabled]}
          onPress={handleComplete}
          disabled={isLoading}
        >
          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          <Text style={styles.buttonText}>Mark Complete</Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.buttonRefresh, isLoading && styles.buttonDisabled]}
          onPress={checkStatus}
          disabled={isLoading}
        >
          <Ionicons name="sync" size={16} color="#FFFFFF" />
          <Text style={styles.buttonText}>Refresh Status</Text>
        </Pressable>
      </View>

      <Text style={styles.note}>
        💡 After resetting, reload the app to see the onboarding tutorial
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(18, 18, 25, 0.9)',
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 48, 64, 0.2)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    color: '#ABABAB',
    fontSize: 14,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusCompleted: {
    backgroundColor: 'rgba(52, 199, 89, 0.2)',
  },
  statusPending: {
    backgroundColor: 'rgba(255, 159, 10, 0.2)',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressLabel: {
    color: '#ABABAB',
    fontSize: 14,
    marginRight: 8,
  },
  progressText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  skippedText: {
    color: '#FF9F0A',
    fontSize: 12,
    marginLeft: 8,
  },
  buttonContainer: {
    gap: 8,
    marginTop: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  buttonReset: {
    backgroundColor: '#FF3040',
  },
  buttonComplete: {
    backgroundColor: '#34C759',
  },
  buttonRefresh: {
    backgroundColor: '#007AFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  note: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 12,
    fontStyle: 'italic',
  },
});
