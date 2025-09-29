import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CustomIcon } from '../../components/ui/CustomIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuth } from './AuthProvider';

const { width, height } = Dimensions.get('window');
const vw = width / 100;
const vh = height / 100;

// Your palette
const PALETTE = {
  backgroundStart: '#121212',
  backgroundEnd: '#1E1E1E',
  textPrimary: '#FFFFFF',
  textSecondary: '#FFFFFF99',
  textTertiary: '#FFFFFF4D',
  divider: '#FFFFFF24',
  accentPrimary: '#0A84FF',
  accentSecond: '#30D158',
  inputBG: '#2C2C2E',
};

export default function SignInScreen() {
  const { signInWithEmail, signUpWithEmail, resetPassword, authError, signInAsAdmin } = useAuth();

  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0); // 0: Welcome, 1: Email, 2: Password, 3: Verify
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState(['', '', '', '']);
  const [adminPasscode, setAdminPasscode] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const slideX = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const codeRefs = useRef<TextInput[]>([]);

  const goToStep = (targetStep: number, direction: 'forward' | 'back' = 'forward') => {
    if (isTransitioning) return;
    setIsTransitioning(true);

    const outTo = direction === 'forward' ? -16 * vw : 16 * vw;
    const inFrom = -outTo;

    Animated.parallel([
      Animated.timing(slideX, { toValue: outTo, duration: 160, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0.6, duration: 160, useNativeDriver: true }),
    ]).start(() => {
      setCurrentStep(targetStep);
      slideX.setValue(inFrom);
      fadeAnim.setValue(0.6);
      Animated.parallel([
        Animated.timing(slideX, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start(() => setIsTransitioning(false));
    });
  };

  const handleNext = () => {
    if (currentStep === 1 && !email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    if (currentStep === 2 && !password.trim()) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }
    Keyboard.dismiss();
    goToStep(currentStep + 1, 'forward');
  };

  const handleBack = () => {
    Keyboard.dismiss();
    if (currentStep > 0) goToStep(currentStep - 1, 'back');
  };

  const handleAuth = async () => {
    try {
      setLoading(true);
      if (isSignUp) {
        await signUpWithEmail(email.trim(), password);
        Keyboard.dismiss();
        goToStep(3, 'forward');
      } else {
        await signInWithEmail(email.trim(), password);
        // On success, navigate to your app screen (not sliding to a new step here)
      }
    } catch (error) {
      console.error('Auth failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSignIn = async () => {
    if (!adminPasscode.trim()) {
      Alert.alert('Error', 'Please enter admin passcode');
      return;
    }
    try {
      setLoading(true);
      await signInAsAdmin(adminPasscode);
    } catch (error) {
      Alert.alert('Error', 'Invalid admin passcode');
    } finally {
      setLoading(false);
    }
  };

  const verifyAccount = () => {
    Alert.alert('Verified', 'Account verified!');
  };

  const handleVerifyCode = (text: string, index: number) => {
    const onlyDigit = text.replace(/[^0-9]/g, '');
    const newCode = [...verifyCode];
    newCode[index] = onlyDigit;
    setVerifyCode(newCode);

    if (onlyDigit && index < 3) codeRefs.current[index + 1]?.focus();
    if (!onlyDigit && index > 0) codeRefs.current[index - 1]?.focus();

    if (newCode.every((c) => c !== '') && newCode.join('').length === 4) {
      verifyAccount();
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <View style={styles.stepContainer}>
            <View style={styles.heroCard}>
              <LinearGradient
                colors={["rgba(10,132,255,0.24)", "rgba(48,209,88,0.12)", "rgba(0,0,0,0)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroAccent}
              />
              <BlurView intensity={50} tint="dark" style={styles.heroGlass}>
                <LinearGradient
                  colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0)"]}
                  start={{ x: 0.25, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroGlassInner}
                >
                  <View style={styles.heroContent}>
                    <View style={styles.logoContainer}>
                      <BlurView intensity={45} tint="dark" style={styles.logoGlass}>
                        <View style={styles.logoInner}>
                          <Text style={styles.logoText}>V</Text>
                        </View>
                      </BlurView>
                    </View>

                    <Text style={styles.title}>Welcome to{'\n'}VibeGames</Text>
                    <Text style={styles.subtitle}>
                      Create and play amazing games{'\n'}with friends worldwide
                    </Text>

                    <View style={styles.buttonGroup}>
                      <Pressable
                        onPress={() => {
                          setIsSignUp(false);
                          Keyboard.dismiss();
                          goToStep(1, 'forward');
                        }}
                        disabled={isTransitioning}
                        hitSlop={10}
                        accessibilityRole="button"
                        style={({ pressed }) => [pressed && styles.pressed]}
                      >
                        <LinearGradient
                          colors={[PALETTE.accentPrimary, '#0A7AFF']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.primaryButton}
                        >
                          <Text
                            style={styles.ctaText}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            maxFontSizeMultiplier={1.2}
                          >
                            LOGIN
                          </Text>
                        </LinearGradient>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          setIsSignUp(true);
                          Keyboard.dismiss();
                          goToStep(1, 'forward');
                        }}
                        disabled={isTransitioning}
                        hitSlop={10}
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                      >
                        <BlurView intensity={30} tint="dark" style={styles.blurButton}>
                          <Text
                            style={styles.secondaryButtonText}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            maxFontSizeMultiplier={1.2}
                          >
                            SIGN UP
                          </Text>
                        </BlurView>
                      </Pressable>

                      <Pressable
                        onPress={() => setShowAdmin(!showAdmin)}
                        hitSlop={10}
                        accessibilityRole="button"
                        style={styles.adminToggle}
                      >
                        <Text style={styles.adminToggleText}>Admin Access →</Text>
                      </Pressable>
                    </View>

                    {showAdmin && (
                      <View style={styles.adminSection}>
                        <BlurView intensity={35} tint="dark" style={styles.adminBlur}>
                          <TextInput
                            style={styles.adminInput}
                            placeholder="Admin passcode"
                            placeholderTextColor={PALETTE.textSecondary}
                            value={adminPasscode}
                            onChangeText={setAdminPasscode}
                            secureTextEntry
                            returnKeyType="done"
                          />
                          <Pressable
                            onPress={handleAdminSignIn}
                            disabled={loading}
                            hitSlop={10}
                            accessibilityRole="button"
                            style={({ pressed }) => pressed && styles.pressed}
                          >
                            <LinearGradient
                              colors={[PALETTE.accentPrimary, '#0A7AFF']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.adminButton}
                            >
                              {loading ? (
                                <ActivityIndicator color={PALETTE.textPrimary} />
                              ) : (
                                <Text style={styles.adminButtonText}>ADMIN SIGN IN</Text>
                              )}
                            </LinearGradient>
                          </Pressable>
                        </BlurView>
                      </View>
                    )}
                  </View>
                </LinearGradient>
              </BlurView>
            </View>
          </View>
        );

      case 1:
        return (
          <View style={styles.stepContainer}>
            <Pressable onPress={handleBack} hitSlop={10} style={styles.backButton}>
              <CustomIcon name="arrow-back" size={22} color={PALETTE.textPrimary} />
            </Pressable>

            <Text style={styles.stepTitle}>Enter your email</Text>
            <Text style={styles.stepSubtitle}>
              We'll use this to {isSignUp ? 'create your account' : 'sign you in'}
            </Text>

            <View style={styles.inputGroup}>
              <BlurView intensity={30} tint="dark" style={styles.glassInput}>
                <CustomIcon name="mail-outline" size={18} color={PALETTE.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor={PALETTE.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoFocus
                  returnKeyType="next"
                  onSubmitEditing={handleNext}
                />
              </BlurView>
            </View>

            <Pressable
              onPress={() => {
                if (!email.trim()) return;
                Keyboard.dismiss();
                goToStep(2, 'forward');
              }}
              disabled={!email.trim() || isTransitioning}
              hitSlop={10}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={
                  email.trim()
                    ? [PALETTE.accentPrimary, PALETTE.accentPrimary]
                    : [PALETTE.inputBG, PALETTE.inputBG]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.continueButton,
                  !email.trim() && { borderColor: PALETTE.divider },
                ]}
              >
                <Text
                  style={[
                    styles.ctaText,
                    !email.trim() && styles.disabledText,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  maxFontSizeMultiplier={1.2}
                >
                  CONTINUE
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContainer}>
            <Pressable onPress={handleBack} hitSlop={10} style={styles.backButton}>
              <CustomIcon name="arrow-back" size={22} color={PALETTE.textPrimary} />
            </Pressable>

            <Text style={styles.stepTitle}>
              {isSignUp ? 'Create password' : 'Enter password'}
            </Text>
            <Text style={styles.stepSubtitle}>
              {isSignUp ? 'Must be at least 6 characters' : 'Enter your account password'}
            </Text>

            <View style={styles.inputGroup}>
              <BlurView intensity={30} tint="dark" style={styles.glassInput}>
                <CustomIcon name="lock-closed-outline" size={18} color={PALETTE.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={PALETTE.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoFocus
                  returnKeyType={isSignUp ? 'next' : 'done'}
                  onSubmitEditing={handleAuth}
                />
              </BlurView>

              {!isSignUp && (
                <Pressable
                  onPress={async () => {
                    if (email) {
                      await resetPassword(email);
                      Alert.alert('Success', 'Password reset email sent!');
                    }
                  }}
                  hitSlop={8}
                  style={styles.forgotPassword}
                >
                  <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                </Pressable>
              )}
            </View>

            <Pressable
              onPress={handleAuth}
              disabled={loading || !password.trim()}
              hitSlop={10}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={
                  password.trim()
                    ? [PALETTE.accentPrimary, PALETTE.accentPrimary]
                    : [PALETTE.inputBG, PALETTE.inputBG]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.continueButton,
                  !password.trim() && { borderColor: PALETTE.divider },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color={PALETTE.textPrimary} />
                ) : (
                  <Text
                    style={[
                      styles.ctaText,
                      !password.trim() && styles.disabledText,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    maxFontSizeMultiplier={1.2}
                  >
                    {isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN'}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContainer}>
            <Pressable onPress={handleBack} hitSlop={10} style={styles.backButton}>
              <CustomIcon name="arrow-back" size={22} color={PALETTE.textPrimary} />
            </Pressable>

            <Text style={styles.stepTitle}>Verify your email</Text>
            <Text style={styles.stepSubtitle}>Code sent to {email}</Text>

            <View style={styles.codeContainer}>
              {[0, 1, 2, 3].map((index) => (
                <BlurView key={index} intensity={30} tint="dark" style={styles.codeBox}>
                  <TextInput
                    ref={(el) => {
                      if (el) codeRefs.current[index] = el;
                    }}
                    style={styles.codeInput}
                    value={verifyCode[index]}
                    onChangeText={(text) => handleVerifyCode(text, index)}
                    keyboardType="number-pad"
                    maxLength={1}
                    autoFocus={index === 0}
                    placeholder="•"
                    placeholderTextColor={PALETTE.textTertiary}
                  />
                </BlurView>
              ))}
            </View>

            <Pressable onPress={() => Alert.alert('Code Resent', 'Check your email')} hitSlop={8}>
              <Text style={styles.resendText}>Resend code</Text>
            </Pressable>

            <LinearGradient
              colors={[PALETTE.accentPrimary, PALETTE.accentPrimary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.continueButton}
            >
              <Text style={styles.ctaText}>VERIFY</Text>
            </LinearGradient>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    // Keeping your current background approach (not switching to the new background values)
    <LinearGradient colors={['#000000', '#1C1C1E']} style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
          >
            {authError ? (
              <BlurView intensity={50} tint="dark" style={styles.errorContainer}>
                <Text style={styles.errorText}>{authError}</Text>
              </BlurView>
            ) : null}

            <Animated.View
              style={{
                opacity: fadeAnim,
                transform: [{ translateX: slideX }],
              }}
            >
              {renderStep()}

              <View style={styles.indicators}>
                {[0, 1, 2, 3].map((step) => (
                  <View
                    key={step}
                    style={[styles.indicator, currentStep === step && styles.indicatorActive]}
                  />
                ))}
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingBottom: 4 * vh, paddingHorizontal: '6%' },

  stepContainer: {
    minHeight: '52%',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },

  heroCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: 'rgba(22, 22, 28, 0.9)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.45,
    shadowRadius: 40,
    elevation: 24,
  },
  heroAccent: {
    position: 'absolute',
    top: -120,
    right: -160,
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.7,
    zIndex: 0,
  },
  heroGlass: {
    borderRadius: 26,
    overflow: 'hidden',
    zIndex: 1,
  },
  heroGlassInner: {
    borderRadius: 26,
    paddingHorizontal: '10%',
    paddingTop: 4 * vh,
    paddingBottom: 4 * vh,
  },
  heroContent: {
    alignItems: 'center',
    gap: 2.4 * vh,
  },

  // Logo
  logoContainer: {
    marginBottom: 3 * vh,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  logoGlass: {
    width: 18 * vw,
    height: 18 * vw,
    borderRadius: 5 * vw,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.divider,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInner: {
    width: '88%',
    height: '88%',
    borderRadius: 5 * vw,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 7.5 * vw,
    fontWeight: '900',
    color: PALETTE.textPrimary,
    letterSpacing: 1,
  },

  // Text
  title: {
    fontSize: Math.max(24, 3.6 * vw),
    fontWeight: '800',
    color: PALETTE.textPrimary,
    textAlign: 'center',
    marginBottom: 0.6 * vh,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: Math.max(13, 1.9 * vw),
    color: PALETTE.textSecondary,
    textAlign: 'center',
    marginBottom: 2.8 * vh,
    lineHeight: 2.6 * vh,
  },

  // Buttons
  buttonGroup: { width: '100%', gap: 14 },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 1.6 * vh,
    alignItems: 'center',
    marginBottom: 1.0 * vh,
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.divider,
  },
  ctaText: {
    fontSize: Math.max(13, 1.8 * vw),
    lineHeight: Math.max(16, 2.2 * vw),
    paddingHorizontal: 2 * vw,
    fontWeight: '700',
    color: PALETTE.textPrimary,
    letterSpacing: 0.5,
    textAlignVertical: 'center',
  },
  secondaryButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 1.0 * vh,
    width: '100%',
  },
  blurButton: {
    paddingVertical: 1.6 * vh,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.divider,
    borderRadius: 14,
  },
  secondaryButtonText: {
    fontSize: Math.max(13, 1.8 * vw),
    lineHeight: Math.max(16, 2.2 * vw),
    fontWeight: '700',
    color: PALETTE.textPrimary,
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  adminToggle: { alignSelf: 'center', marginTop: 1.4 * vh },
  adminToggleText: {
    color: PALETTE.textSecondary,
    fontSize: Math.max(12, 1.7 * vw),
    fontWeight: '600',
  },

  // Admin section
  adminSection: { width: '100%', marginTop: 1.6 * vh, borderRadius: 14, overflow: 'hidden' },
  adminBlur: {
    padding: 2.0 * vh,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.divider,
  },
  adminInput: {
    backgroundColor: PALETTE.inputBG,
    borderRadius: 12,
    padding: 1.6 * vh,
    fontSize: Math.max(14, 1.9 * vw),
    marginBottom: 1.2 * vh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.divider,
    color: PALETTE.textPrimary,
  },
  adminButton: {
    borderRadius: 12,
    paddingVertical: 1.6 * vh,
    alignItems: 'center',
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.divider,
  },
  adminButtonText: {
    color: PALETTE.textPrimary,
    fontSize: Math.max(12, 1.7 * vw),
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Navigation
  backButton: {
    position: 'absolute',
    top: 1.4 * vh,
    left: 0,
    padding: 1.0 * vh,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.divider,
  },

  // Steps
  stepTitle: {
    fontSize: Math.max(20, 2.6 * vw),
    fontWeight: '800',
    color: PALETTE.textPrimary,
    textAlign: 'center',
    marginBottom: 1.0 * vh,
    marginTop: 6.2 * vh,
  },
  stepSubtitle: {
    fontSize: Math.max(12, 1.8 * vw),
    color: PALETTE.textSecondary,
    textAlign: 'center',
    marginBottom: 2.6 * vh,
  },

  // Inputs
  inputGroup: { width: '100%', marginBottom: 2.8 * vh },
  glassInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.inputBG,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 0.6 * vh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.divider,
  },
  input: {
    flex: 1,
    fontSize: Math.max(14, 1.9 * vw),
    color: PALETTE.textPrimary,
    paddingVertical: 1.6 * vh,
    paddingLeft: 12,
  },
  continueButton: {
    borderRadius: 14,
    paddingVertical: 1.6 * vh,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.divider,
  },
  disabledText: { color: PALETTE.textTertiary },

  forgotPassword: { alignSelf: 'flex-end', marginTop: 1.0 * vh },
  forgotPasswordText: {
    color: PALETTE.textSecondary,
    fontSize: Math.max(12, 1.7 * vw),
    fontWeight: '500',
  },

  // Code
  codeContainer: {
    flexDirection: 'row',
    columnGap: 3 * vw,
    marginBottom: 2.6 * vh,
    width: '80%',
    justifyContent: 'center',
  },
  codeBox: {
    width: 14 * vw,
    height: 14 * vw,
    borderRadius: 14,
    backgroundColor: PALETTE.inputBG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.divider,
    overflow: 'hidden',
  },
  codeInput: {
    flex: 1,
    fontSize: Math.max(18, 3.6 * vw),
    fontWeight: '700',
    textAlign: 'center',
    color: PALETTE.textPrimary,
  },
  resendText: {
    color: PALETTE.textSecondary,
    fontSize: Math.max(12, 1.7 * vw),
    fontWeight: '600',
    marginBottom: 2.0 * vh,
  },

  // Indicators
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    columnGap: 2 * vw,
    marginTop: 3.0 * vh,
    marginBottom: 1.6 * vh,
  },
  indicator: {
    width: 2 * vw,
    height: 2 * vw,
    borderRadius: vw,
    backgroundColor: PALETTE.textTertiary,
  },
  indicatorActive: {
    width: 6 * vw,
    backgroundColor: PALETTE.accentPrimary,
  },

  // Error
  errorContainer: {
    position: 'absolute',
    top: 7 * vh,
    left: '6%',
    right: '6%',
    padding: 1.6 * vh,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PALETTE.divider,
    zIndex: 100,
  },
  errorText: {
    color: PALETTE.textPrimary,
    fontSize: Math.max(12, 1.7 * vw),
    textAlign: 'center',
    fontWeight: '500',
  },

  // Press feedback
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
});