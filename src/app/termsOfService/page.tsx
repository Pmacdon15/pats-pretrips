import { Disclaimer } from "@/components/ui/disclaimer/disclaimer";
import GoHomeButton from "@/components/ui/go-home-button/GoHomeButton";

export default function Page() {
    return (
        <Disclaimer
            text='Pat&apos;s Pre-Trips is currently in production but please be aware that during this period,
                data security and stability cannot be guaranteed. Any data you enter into the application may be lost,
                modified, or compromised from time to time. By using this application, you
                acknowledge these risks and agree to use the service at your own risk. We recommend not storing any
                sensitive or critical information until the full release version is available. At this time we offer the service free.'
            name='Terms of Service'
        />
    )
}