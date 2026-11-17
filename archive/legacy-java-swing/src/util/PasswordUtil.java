package util;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.spec.KeySpec;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

public final class PasswordUtil {
    private static final String PREFIX = "pbkdf2$";
    private static final int ITERATIONS = 120_000;
    private static final int KEY_LENGTH = 256;

    private PasswordUtil() {}

    public static String hashPassword(String plainPassword) {
        if (plainPassword == null || plainPassword.isEmpty()) {
            throw new IllegalArgumentException("Password tidak boleh kosong");
        }
        try {
            byte[] salt = new byte[16];
            new SecureRandom().nextBytes(salt);
            KeySpec spec = new PBEKeySpec(plainPassword.toCharArray(), salt, ITERATIONS, KEY_LENGTH);
            SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            byte[] hash = factory.generateSecret(spec).getEncoded();
            return PREFIX + ITERATIONS + "$"
                    + Base64.getEncoder().encodeToString(salt) + "$"
                    + Base64.getEncoder().encodeToString(hash);
        } catch (Exception e) {
            throw new IllegalStateException("Gagal melakukan hashing password", e);
        }
    }

    public static boolean needsRehash(String storedPassword) {
        return storedPassword == null || !storedPassword.startsWith(PREFIX);
    }

    public static boolean verifyPassword(String plainPassword, String storedPassword) {
        if (plainPassword == null || storedPassword == null || storedPassword.isEmpty()) {
            return false;
        }
        if (!storedPassword.startsWith(PREFIX)) {
            return MessageDigest.isEqual(
                    plainPassword.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                    storedPassword.getBytes(java.nio.charset.StandardCharsets.UTF_8)
            );
        }
        try {
            String[] parts = storedPassword.split("\\$");
            if (parts.length != 4) {
                return false;
            }
            int iterations = Integer.parseInt(parts[1]);
            byte[] salt = Base64.getDecoder().decode(parts[2]);
            byte[] expected = Base64.getDecoder().decode(parts[3]);
            KeySpec spec = new PBEKeySpec(plainPassword.toCharArray(), salt, iterations, expected.length * 8);
            SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            byte[] actual = factory.generateSecret(spec).getEncoded();
            return MessageDigest.isEqual(expected, actual);
        } catch (Exception e) {
            return false;
        }
    }
}
