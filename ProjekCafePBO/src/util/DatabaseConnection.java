/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package util;

/**
 *
 * @author Daffa Danendra
 */


import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

public class DatabaseConnection {
    private static final String URL = System.getenv().getOrDefault("NOMCHERRY_DB_URL", "jdbc:postgresql://localhost:5432/db_kafe");
    private static final String USER = System.getenv().getOrDefault("NOMCHERRY_DB_USER", "postgres");
    private static final String PASSWORD = System.getenv("NOMCHERRY_DB_PASSWORD");
    
    public static Connection getConnection() {
        if (PASSWORD == null || PASSWORD.trim().isEmpty()) {
            System.out.println("Koneksi database gagal: NOMCHERRY_DB_PASSWORD belum diatur.");
            return null;
        }
        try {
            Class.forName("org.postgresql.Driver");
            Connection conn = DriverManager.getConnection(URL, USER, PASSWORD);
            System.out.println("Koneksi database berhasil!");
            return conn;
        } catch (ClassNotFoundException | SQLException e) {
            System.out.println("Koneksi database gagal: " + e.getMessage());
            e.printStackTrace();
            return null;
        }
    }
    
    // Test connection
    public static void main(String[] args) {
        Connection conn = getConnection();
        if (conn != null) {
            try {
                conn.close();
                System.out.println("Test koneksi berhasil!");
            } catch (SQLException e) {
                e.printStackTrace();
            }
        }
    }
}
