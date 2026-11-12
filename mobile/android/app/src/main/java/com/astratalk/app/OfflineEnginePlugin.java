package com.astratalk.app;

import android.app.DownloadManager;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

import java.io.File;
import java.util.HashMap;
import java.util.Map;

@CapacitorPlugin(name = "OfflineEngine")
public class OfflineEnginePlugin extends Plugin {

    private Map<String, Long> activeDownloads = new HashMap<>();

    @PluginMethod
    public void getModelStatus(PluginCall call) {
        File modelsDir = new File(getContext().getExternalFilesDir(null), "models");
        if (!modelsDir.exists()) {
            modelsDir.mkdirs();
        }

        File llamaModel = new File(modelsDir, "Llama-3.2-3B-Instruct-Q4_K_M.gguf");
        File qwenModel = new File(modelsDir, "qwen2.5-3b-instruct-q4_k_m.gguf");
        File imageModel = new File(modelsDir, "sd-turbo-q4.gguf");

        JSObject ret = new JSObject();
        ret.put("modelsPath", modelsDir.getAbsolutePath());
        
        ret.put("llamaReady", llamaModel.exists() && llamaModel.length() > 500000000);
        ret.put("llamaSize", llamaModel.exists() ? llamaModel.length() : 0);

        ret.put("qwenReady", qwenModel.exists() && qwenModel.length() > 500000000);
        ret.put("qwenSize", qwenModel.exists() ? qwenModel.length() : 0);

        ret.put("imageReady", imageModel.exists() && imageModel.length() > 500000000);
        ret.put("imageSize", imageModel.exists() ? imageModel.length() : 0);

        call.resolve(ret);
    }

    @PluginMethod
    public void startDownload(PluginCall call) {
        String url = call.getString("url");
        String filename = call.getString("filename");

        if (url == null || filename == null) {
            call.reject("URL and filename required");
            return;
        }

        File modelsDir = new File(getContext().getExternalFilesDir(null), "models");
        if (!modelsDir.exists()) {
            modelsDir.mkdirs();
        }

        File destFile = new File(modelsDir, filename);
        if (destFile.exists()) {
            destFile.delete();
        }

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle("Astra Talk: Downloading " + filename);
        request.setDescription("Downloading Snapdragon 8 Gen 2 offline AI model...");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationUri(Uri.fromFile(destFile));

        DownloadManager dm = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        long downloadId = dm.enqueue(request);
        activeDownloads.put(filename, downloadId);

        JSObject ret = new JSObject();
        ret.put("status", "started");
        ret.put("downloadId", downloadId);
        ret.put("targetFile", destFile.getAbsolutePath());
        call.resolve(ret);
    }

    @PluginMethod
    public void getDownloadProgress(PluginCall call) {
        String filename = call.getString("filename");
        if (filename == null || !activeDownloads.containsKey(filename)) {
            File modelsDir = new File(getContext().getExternalFilesDir(null), "models");
            File destFile = new File(modelsDir, filename != null ? filename : "");
            JSObject fallback = new JSObject();
            fallback.put("bytesDownloaded", destFile.exists() ? destFile.length() : 0);
            fallback.put("status", destFile.exists() && destFile.length() > 500000000 ? "completed" : "idle");
            call.resolve(fallback);
            return;
        }

        long downloadId = activeDownloads.get(filename);
        DownloadManager dm = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Query query = new DownloadManager.Query();
        query.setFilterById(downloadId);

        Cursor cursor = dm.query(query);
        JSObject ret = new JSObject();

        if (cursor != null && cursor.moveToFirst()) {
            int bytesDownloadedIdx = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
            int bytesTotalIdx = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
            int statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);

            long bytesDownloaded = bytesDownloadedIdx != -1 ? cursor.getLong(bytesDownloadedIdx) : 0;
            long bytesTotal = bytesTotalIdx != -1 ? cursor.getLong(bytesTotalIdx) : 0;
            int status = statusIdx != -1 ? cursor.getInt(statusIdx) : 0;

            ret.put("bytesDownloaded", bytesDownloaded);
            ret.put("bytesTotal", bytesTotal);

            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                ret.put("status", "completed");
            } else if (status == DownloadManager.STATUS_RUNNING) {
                ret.put("status", "downloading");
            } else if (status == DownloadManager.STATUS_FAILED) {
                ret.put("status", "failed");
            } else {
                ret.put("status", "pending");
            }
            cursor.close();
        } else {
            ret.put("status", "unknown");
        }

        call.resolve(ret);
    }
}
