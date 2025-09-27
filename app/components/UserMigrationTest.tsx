/**
 * Test component for user migration
 * Use this component to run the user migration from within your React Native app
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { UserMigrationService } from '../services/UserMigrationService';

export function UserMigrationTest() {
  const [migrationStatus, setMigrationStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const checkMigrationStatus = async () => {
    setIsLoading(true);
    addLog('Checking migration status...');
    
    try {
      const migrationService = UserMigrationService.getInstance();
      const status = await migrationService.checkMigrationStatus();
      setMigrationStatus(status);
      addLog(`Status: ${status.needsMigration} need migration, ${status.alreadyMigrated} already migrated`);
    } catch (error) {
      addLog(`Error: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const runMigration = async () => {
    Alert.alert(
      'Confirm Migration',
      'This will migrate all users from UID-based to username-based document IDs. This is a one-time operation. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Migrate', 
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            addLog('Starting migration...');
            
            try {
              const migrationService = UserMigrationService.getInstance();
              const results = await migrationService.migrateAllUsers();
              addLog(`Migration completed: ${results.successful} successful, ${results.failed} failed, ${results.skipped} skipped`);
              
              // Refresh status
              await checkMigrationStatus();
            } catch (error) {
              addLog(`Migration error: ${error}`);
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const testUserLookup = async () => {
    setIsLoading(true);
    addLog('Testing user lookup...');
    
    try {
      const migrationService = UserMigrationService.getInstance();
      
      // Test looking up by username
      const userByUsername = await migrationService.getUserByUsername('sharmaashwin4001');
      if (userByUsername) {
        addLog(`✅ Found user by username: ${userByUsername.handle}`);
      } else {
        addLog('❌ No user found by username');
      }
      
      // Test looking up by UID (old format)
      const userByUID = await migrationService.getUserByUID('n7Cvmi0XSfMpXktE4MOnzuiYoTQ2');
      if (userByUID) {
        addLog(`⚠️ Found user by UID (old format): ${userByUID.handle}`);
      } else {
        addLog('✅ No user found by UID (expected after migration)');
      }
      
    } catch (error) {
      addLog(`Test error: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>User Migration Tool</Text>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.button, styles.primaryButton]} 
          onPress={checkMigrationStatus}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>Check Migration Status</Text>
        </TouchableOpacity>
        
        {migrationStatus && migrationStatus.needsMigration > 0 && (
          <TouchableOpacity 
            style={[styles.button, styles.warningButton]} 
            onPress={runMigration}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>Run Migration ({migrationStatus.needsMigration} users)</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity 
          style={[styles.button, styles.secondaryButton]} 
          onPress={testUserLookup}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>Test User Lookup</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.clearButton]} 
          onPress={clearLogs}
        >
          <Text style={styles.buttonText}>Clear Logs</Text>
        </TouchableOpacity>
      </View>

      {migrationStatus && (
        <View style={styles.statusContainer}>
          <Text style={styles.statusTitle}>Migration Status:</Text>
          <Text>Total Users: {migrationStatus.total}</Text>
          <Text>Need Migration: {migrationStatus.needsMigration}</Text>
          <Text>Already Migrated: {migrationStatus.alreadyMigrated}</Text>
        </View>
      )}

      <View style={styles.logsContainer}>
        <Text style={styles.logsTitle}>Logs:</Text>
        {logs.map((log, index) => (
          <Text key={index} style={styles.logEntry}>{log}</Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  buttonContainer: {
    marginBottom: 20,
  },
  button: {
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  warningButton: {
    backgroundColor: '#FF9500',
  },
  secondaryButton: {
    backgroundColor: '#34C759',
  },
  clearButton: {
    backgroundColor: '#8E8E93',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  statusContainer: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  logsContainer: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    minHeight: 200,
  },
  logsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  logEntry: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 5,
    color: '#333',
  },
});

// Add default export for Expo Router
export default UserMigrationTest;
