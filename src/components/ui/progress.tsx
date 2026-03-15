"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  indicatorClassName?: string
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, indicatorClassName, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative h-1 w-full overflow-hidden rounded-sm bg-[#F0F0EB] dark:bg-[#2A2A2A]",
        className
      )}
      {...props}
    >
      <div
        className={cn("h-full w-full flex-1 bg-primary transition-all", indicatorClassName)}
        style={{ transform: `translateX(-${100 - value}%)` }}
      />
    </div>
  )
)
Progress.displayName = "Progress"

export { Progress } 