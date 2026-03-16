-- Add date_of_birth column to profiles table
ALTER TABLE public.profiles
ADD COLUMN date_of_birth date NULL;

-- Add age_confirmed column to track age verification
ALTER TABLE public.profiles
ADD COLUMN age_confirmed boolean DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.date_of_birth IS 'Customer date of birth for 18+ verification';
COMMENT ON COLUMN public.profiles.age_confirmed IS 'Customer confirmed they are 18+ and data is accurate';