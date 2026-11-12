'use client'

import { cn } from "@/lib/utils";
import type * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";

function Separator({ className, orientation = "horizontal", decorative = true, ...props }: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
    return (
        <SeparatorPrimitive.Root
            orientation={orientation}
            data-slot="separator"
            decorative={decorative}
            className={cn("data-[orientation=vertical]:w-px bg-border data-[orientation=horizontal]:w-full shrink-0 data-[orientation=vertical]:h-full data-[orientation=horizontal]:h-px", className)}
            {...props}
        />
    );
}

export { Separator };
