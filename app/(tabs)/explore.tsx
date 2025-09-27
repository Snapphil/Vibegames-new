import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { UserMigrationTest } from '../components/UserMigrationTest';

export default function TabTwoScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>User Migration Tool</Text>
      <UserMigrationTest />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F14',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
    paddingTop: 60,
  },
});
