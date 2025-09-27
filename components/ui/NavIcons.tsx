import React from "react";
import { CustomIcon } from "./CustomIcon";

export function BoltIcon({ size = 26, color = "#B7B9C0" }: { size?: number; color?: string }) {
  return <CustomIcon name="flash" size={size} color={color} />;
}

export function PenIcon({ size = 26, color = "#B7B9C0" }: { size?: number; color?: string }) {
  return <CustomIcon name="create-outline" size={size} color={color} />;
}


