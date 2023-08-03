import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { ThemeProvider, DarkTheme } from '@react-navigation/native'

import { TRPCProvider } from "../utils/api";
import baseConfig from "@ei/tailwind-config";
import { AuthProvider } from "src/context/auth";

// This is the main layout of the app
// It wraps your pages with the providers they need
const RootLayout = () => {
  return (
    <AuthProvider>
      <TRPCProvider>
        <SafeAreaProvider>
          {/*
            The Stack component displays the current page.
            It also allows you to configure your screens 
          */}
          <ThemeProvider value={{...DarkTheme, colors: {...DarkTheme.colors, ...baseConfig.theme.colors, text: baseConfig.theme.colors.background, primary: baseConfig.theme.colors.primary.DEFAULT}}}>
            <Stack
              screenOptions={{
                headerStyle: {
                  backgroundColor: baseConfig.theme.colors.primary.DEFAULT,
                },
              }}
            />
          </ThemeProvider>
          <StatusBar />
        </SafeAreaProvider>
      </TRPCProvider>
    </AuthProvider>
  );
};

export default RootLayout;