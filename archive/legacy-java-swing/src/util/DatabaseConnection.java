package util;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

public class DatabaseConnection {
    private static final String URL = System.getenv().getOrDefault("NOMCHERRY_DB_URL", "jdbc:postgresql://localhost:5432/db_kafe");
    private static final String USER = System.getenv().getOrDefault("NOMCHERRY_DB_USER", "postgres");
    private static final String PASSWORD = System.getenv("NOMCHERRY_DB_PASSWORD");

    public static Connection getRequiredConnection() throws SQLException {
        if (PASSWORD == null || PASSWORD.trim().isEmpty()) {
            throw new SQLException("NOMCHERRY_DB_PASSWORD belum diatur pada environment.");
        }
        try {
            Class.forName("org.postgresql.Driver");
            return DriverManager.getConnection(URL, USER, PASSWORD);
        } catch (ClassNotFoundException e) {
            throw new SQLException("Driver JDBC PostgreSQL tidak ditemukan: " + e.getMessage(), e);
        }
    }

    public static Connection getConnection() {
        try {
            return getRequiredConnection();
        } catch (SQLException e) {
            System.err.println("Koneksi database gagal: " + e.getMessage());
            return null;
        }
    }
}
