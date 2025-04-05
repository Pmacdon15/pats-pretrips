import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { addOnRouteDefects, addTrip } from "@/actions/actions"

export const useAddDefectOnRoute = (tripId: number, driverEmail: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ formData, driverEmail, tripId, }: { formData: FormData, driverEmail: string, tripId: number }) => {
            const bindWithDriverEmail = addOnRouteDefects.bind(null, driverEmail);
            const bindActionWithTripId = bindWithDriverEmail.bind(null, tripId);
            return bindActionWithTripId(formData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trip', tripId, driverEmail] });
            queryClient.invalidateQueries({ queryKey: ['trips', driverEmail] });
        },
        onError: (error) => {
            console.error('Mutation error:', error);
        }
    });
};

export const useAddTrip = (driverEmail: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ formData, driverEmail }: { formData: FormData, driverEmail: string }) => {
            const bindWithDriverEmail = addTrip.bind(null, driverEmail);
            return bindWithDriverEmail(formData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trips', driverEmail] });
        },
        onError: (error) => {
            console.error('Mutation error:', error);
        }
    });
};
