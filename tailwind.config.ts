import type { Config } from "tailwindcss";

export default {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts}",
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: [
  				'var(--font-sans)',
  				'Inter',
  				'-apple-system',
  				'BlinkMacSystemFont',
  				'Segoe UI',
  				'sans-serif'
  			]
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			status: {
  				positive: '#22C55E',
  				warning: '#F97316',
  				negative: '#EF4444',
  				info: '#06B6D4',
  				neutral: '#6B7280'
  			},
  			pill: {
  				'red-bg': '#FEF2F2',
  				'red-text': '#DC2626',
  				'orange-bg': '#FFF7ED',
  				'orange-text': '#EA580C',
  				'yellow-bg': '#FEFCE8',
  				'yellow-text': '#CA8A04',
  				'green-bg': '#F0FDF4',
  				'green-text': '#16A34A',
  				'teal-bg': '#F0FDFA',
  				'teal-text': '#0D9488',
  				'blue-bg': '#EFF6FF',
  				'blue-text': '#2563EB',
  				'indigo-bg': '#EEF2FF',
  				'indigo-text': '#4F46E5',
  				'purple-bg': '#FAF5FF',
  				'purple-text': '#9333EA',
  				'pink-bg': '#FDF2F8',
  				'pink-text': '#DB2777',
  				'gray-bg': '#F9FAFB',
  				'gray-text': '#4B5563'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		borderRadius: {
  			lg: '8px',
  			md: '6px',
  			sm: '4px',
  			xl: '12px'
  		},
  		boxShadow: {
  			xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
  			sm: '0 1px 3px rgba(0, 0, 0, 0.06)',
  			md: '0 4px 12px rgba(0, 0, 0, 0.08)',
  			lg: '0 8px 24px rgba(0, 0, 0, 0.12)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
