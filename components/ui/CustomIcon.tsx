import React from 'react';
import { Svg, Path } from 'react-native-svg';

export interface CustomIconProps {
  name: string;
  size?: number;
  color?: string;
}

export function CustomIcon({ name, size = 24, color = '#000' }: CustomIconProps) {
  const getIconPath = (iconName: string) => {
    switch (iconName) {
      case 'heart':
        return "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z";
      
      case 'heart-outline':
        return "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78zM12 18.35l-6.95-6.95a3.5 3.5 0 0 1 4.95-4.95l2 2 2-2a3.5 3.5 0 0 1 4.95 4.95L12 18.35z";
      
      case 'chatbubble':
        return "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z";
      
      case 'chatbubble-outline':
        return "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10zm-2-1V5H5v12.17L6.17 16H19z";
      
      case 'chatbubble-ellipses-outline':
        return "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10zm-2-1V5H5v12.17L6.17 16H19zM7 10h2v2H7v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z";
      
      case 'eye-outline':
        return "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z";
      
      case 'share-outline':
        return "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.50-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z";
      
      case 'bookmark-outline':
        return "M19 3H5c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L9 18V5h10v13z";
      
      case 'play':
        return "M8 5v14l11-7z";
      
      case 'add':
        return "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z";
      
      case 'add-circle':
        return "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z";
      
      case 'close':
        return "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";
      
      case 'send':
        return "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z";
      
      case 'refresh':
        return "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z";
      
      case 'checkmark':
        return "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";
      
      case 'trash-outline':
        return "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z";
      
      case 'create-outline':
        return "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z";
      
      case 'game-controller-outline':
        return "M17.5 2C15.57 2 14 3.57 14 5.5c0 .55.45 1 1 1s1-.45 1-1C16 4.67 16.67 4 17.5 4S19 4.67 19 5.5c0 1.93-1.57 3.5-3.5 3.5-.55 0-1 .45-1 1s.45 1 1 1c2.93 0 5.5-2.57 5.5-5.5C21 3.57 19.43 2 17.5 2zM6.5 2C4.57 2 3 3.57 3 5.5C3 8.43 5.57 11 8.5 11c.55 0 1-.45 1-1s-.45-1-1-1C7.67 9 7 8.33 7 7.5S7.67 6 8.5 6 10 6.67 10 7.5c0 .55.45 1 1 1s1-.45 1-1C12 4.57 10.43 3 8.5 3z";
      
      case 'log-out-outline':
        return "M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z";
      
      case 'chevron-back':
        return "M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z";
      
      case 'arrow-back':
        return "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z";
      
      case 'arrow-forward':
        return "M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z";
      
      case 'arrow-up':
        return "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z";
      
      case 'hourglass':
        return "M6 2v6h.01L6 8.01 10 12l-4 4 .01.01H6V22h12v-5.99h-.01L18 16l-4-4 4-3.99-.01-.01H18V2H6zm10 14.5V20H8v-3.5l4-4 4 4zm-4-5l-4-4V4h8v3.5l-4 4z";
      
      case 'volume-high':
        return "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z";
      
      case 'volume-mute':
        return "M7 9v6h4l5 5V4l-5 5H7z";
      
      case 'flash':
        return "M7 2v11h3v9l7-12h-4l4-8z";
      
      case 'ellipsis-horizontal':
        return "M5 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm7 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm7 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z";
      
      case 'alert-circle':
        return "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z";
      
      case 'analytics-outline':
        return "M9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4zm2.5 2.25l1.5-1.5-6.5-6.5-4 4-6.5-6.5L1 10.25l7.5 7.5 4-4 5.5 5.5z";
      
      case 'warning-outline':
        return "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z";
      
      case 'bug-outline':
        return "M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5s-.96.06-1.42.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z";
      
      case 'phone-portrait-outline':
        return "M17 1H7c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zM7 4V3h10v1H7zm0 14V6h10v12H7zm0 3v-1h10v1H7z";
      
      case 'information-circle-outline':
        return "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z";
      
      case 'wifi':
        return "M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.07 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z";
      
      case 'chevron-down':
        return "M7 10l5 5 5-5z";
      
      case 'mail-outline':
        return "M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z";
      
      case 'lock-closed-outline':
        return "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z";
      
      case 'calculator-outline':
        return "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM6.25 7.72h2.5v.01H6.25V7.72zm5.5 0h2.5v.01h-2.5V7.72zm5.5 0h2.5v.01h-2.5V7.72zM6.25 10.22h2.5v.01H6.25v-.01zm5.5 0h2.5v.01h-2.5v-.01zm5.5 0h2.5v.01h-2.5v-.01zM6.25 12.72h2.5v.01H6.25v-.01zm5.5 0h2.5v.01h-2.5v-.01zm5.5 0h2.5v.01h-2.5v-.01zM6.25 15.22h2.5v.01H6.25v-.01zm5.5 0h2.5v.01h-2.5v-.01zm5.5 0h2.5v.01h-2.5v-.01z";
      
      case 'wifi-outline':
        return "M24 7l-3 3c-2.39-2.4-6.21-2.4-8.6 0L9 7c4.19-4.19 10.81-4.19 15 0zm-4 4l-3 3c-.79-.8-2.21-.8-3 0l-3-3c2.39-2.4 6.21-2.4 8 0zm-4 4l-2 2-2-2c.79-.8 2.21-.8 3 0z";
      
      case 'time-outline':
        return "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z";
      
      case 'checkmark-circle-outline':
        return "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8-1.41-1.42z";
      
      case 'construct-outline':
        return "M22.61 18.99l-9.08-9.08c.93-2.34.45-5.1-1.44-7C9.79.61 6.21.4 3.66 2.26L7.5 6.11 6.08 7.52 2.25 3.69C.39 6.23.6 9.82 2.9 12.11c1.9 1.9 4.66 2.37 7 1.44l9.08 9.08c.78.78 2.05.78 2.83 0 .78-.78.78-2.04 0-2.83zM6.08 11.61c-.31 0-.56-.25-.56-.56s.25-.56.56-.56.56.25.56.56-.25.56-.56.56z";
      
      case 'code-working-outline':
        return "M8 3C6.9 3 6 3.9 6 5v4H4c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-6c0-1.1-.9-2-2-2h-2V5c0-1.1-.9-2-2-2H8zm0 2h8v4H8V5zm12 6v6H4v-6h16zm-1 1h-2v2h2v-2zm-4 0h-2v2h2v-2z";
      
      case 'arrow-forward':
        return "M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z";
      
      default:
        // Default fallback icon (a simple square)
        return "M3 3h18v18H3z";
    }
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={getIconPath(name)} fill={color} />
    </Svg>
  );
}

export default CustomIcon;
