import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import addOnRouteDefects from "@/actions/actions"

export const useAddDefectOnRoute = (tripId: number, driverEmail: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ formData, driverEmail, tripId, }: { formData: FormData, driverEmail: string, tripId: number }) => {
            const bindWithDriverEmail = addOnRouteDefects.bind(null, driverEmail);
            const bindActionWithTripId = bindWithDriverEmail.bind(null, tripId);
            return bindActionWithTripId(formData);
        },
        onSuccess: () => {
            console.log("called")
            console.log("data: ", tripId, driverEmail)
            queryClient.invalidateQueries({ queryKey: ['trip', tripId, driverEmail] });
            queryClient.invalidateQueries({ queryKey: ['trips', driverEmail] });
        },
        onError: (error) => {
            console.error('Mutation error:', error);
        }
    });
};

